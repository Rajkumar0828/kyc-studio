# Deploying KYC Studio

This guide puts KYC Studio on one fresh Ubuntu 24.04 server with Docker
installed, behind HTTPS. Commands run on the server unless marked otherwise.

## What runs

`docker-compose.prod.yml` starts five containers:

| Service      | Role                                                                 | Reachable from          |
|--------------|----------------------------------------------------------------------|-------------------------|
| `caddy`      | HTTPS (automatic certificate for `SITE_DOMAIN`), security headers, body size cap | the internet: ports 80 and 443 |
| `app`        | The Next.js app, as the unprivileged `node` user                      | Caddy only              |
| `mongo`      | MongoDB 7 with authentication, WiredTiger cache capped at 0.5 GB      | the app only            |
| `vault`      | Vault in dev mode (in memory)                                         | the app and vault-init  |
| `vault-init` | Re-creates the Transit mount, policy and app token after a Vault restart | nothing                 |

MongoDB and Vault are on an internal Docker network with no published ports
and no route out. Only Caddy publishes ports. Every service restarts
automatically (`unless-stopped`).

What this version stores:

- Policies, the audit chain and AI call metadata are stored in MongoDB.
- Customer cases are **not** stored (`APPLICATION_LOG=file`). The app keeps only
  an ids-and-decisions log in the `app_data` volume.
- Vault runs in dev mode. A Vault restart loses its keys, and `/api/health` then
  reports `degraded`. No customer data depends on those keys in this version.

## 1. Prepare the server

You need:

- Docker Engine with the compose plugin (`docker compose version` works).
- A DNS A (and AAAA, if you use IPv6) record for your host name pointing at the server.
- Inbound ports 80 and 443 open. Port 80 is needed for the certificate challenge
  and the redirect to HTTPS.

If you use `ufw`:

```sh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
```

About 2 GB of RAM is enough.

## 2. Clone

```sh
sudo mkdir -p /opt/kyc-studio
sudo chown "$USER": /opt/kyc-studio
git clone https://github.com/Rajkumar0828/kyc-studio.git /opt/kyc-studio
cd /opt/kyc-studio
```

## 3. Create the two env files

`.env.prod.example` describes every variable. The values go in two files next to
`docker-compose.prod.yml`. Both are gitignored and never copied into the image:

- `.env` is read by docker compose (domain, Vault tokens, MongoDB users).
- `.env.app` is the app's environment (AI provider, access codes, limits).

Create them readable by you only. The commands below write generated secrets
straight into the files without printing them:

```sh
umask 077
secret() { openssl rand -hex 24; }

cat > .env <<EOF
SITE_DOMAIN=kyc.example.com
VAULT_DEV_TOKEN=$(secret)
VAULT_APP_TOKEN=$(secret)
MONGO_ROOT_USER=kycroot
MONGO_ROOT_PASSWORD=$(secret)
MONGO_APP_USER=kycapp
MONGO_APP_PASSWORD=$(secret)
EOF

cat > .env.app <<EOF
AI_PROVIDER=mock
DEMO_ACCESS_CODE=$(secret)
ADMIN_ACCESS_CODE=$(secret)
RATE_LIMIT_PER_MINUTE=30
AI_DAILY_CALL_CAP=500
EOF

chmod 600 .env .env.app
```

Then change `SITE_DOMAIN` to your host name with an editor. For Meta mode, set
`AI_PROVIDER=meta` and add `MODEL_API_KEY=...` in `.env.app`. Give the demo code
to the people who should be able to use the demo, for example from a password
manager. You can read it with `grep DEMO_ACCESS_CODE .env.app`, but don't do
that on a shared screen.

Don't set the storage variables (`POLICY_STORE`, `AI_CALL_LOG`, `AUDIT_LOG`,
`APPLICATION_LOG`, `MONGODB_URI`, `VAULT_ADDR`, `VAULT_TOKEN`) in `.env.app`.
The compose file sets them, and its values win.

The MongoDB users are created only on the very first start, when the
`mongo_data` volume is empty. Changing the MongoDB passwords in `.env`
afterwards does not change the users.

## 4. Start

```sh
docker compose -f docker-compose.prod.yml up -d --build
```

The first build takes a few minutes. Caddy starts once the app is healthy and
then requests the certificate, which can take up to a minute.

## 5. Check

```sh
docker compose -f docker-compose.prod.yml ps
```

`app`, `mongo` and `vault` should show `healthy`, and `caddy` and `vault-init`
should show `running`.

From any machine:

```sh
curl -fsS https://kyc.example.com/api/health/live
# {"live":true}

curl -fsS https://kyc.example.com/api/health
# expect "status":"ok", "mongo":"up", "vault":{"status":"up","tokenValid":true,...}
# and stores policy/aiCalls/audit = mongo, applications = file

curl -sI https://kyc.example.com/ | grep -iE 'strict-transport|x-content-type|content-security'
curl -sI http://kyc.example.com/ | head -1      # a redirect to https
```

On the server, MongoDB and Vault must not listen on any host port. This prints
nothing:

```sh
sudo ss -tlnp | grep -E ':(27017|8200)\b'
```

**About `/api/health`:** `"status":"degraded"` is information, not an outage.
It always answers HTTP 200 and lists the reasons under `warnings`. The container
healthcheck uses `/api/health/live`, so a warning never restarts or blocks
anything.

After a Vault restart the warning "Vault restarted: previous keys lost" stays
until you clear it. This version stores no cases, so nothing needs repairing.
Clear it with:

```sh
docker compose -f docker-compose.prod.yml exec mongo sh -c \
  'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin kyc_studio --eval "db.system_state.deleteOne({_id: \"vault\"})"'
```

The single quotes make the container's own shell expand the credentials, so
they are not printed and don't appear in your shell history.

## 6. Redeploy after a change

```sh
cd /opt/kyc-studio
git pull
docker compose -f docker-compose.prod.yml up -d --build --no-deps app
```

This rebuilds and restarts only the app. MongoDB, Vault and Caddy keep running,
and data is untouched. Then repeat the checks in step 5.

- **Changed `.env.app`:** `docker compose -f docker-compose.prod.yml up -d --no-deps app`.
- **Changed `docker/caddy/Caddyfile`:** `docker compose -f docker-compose.prod.yml restart caddy`.
- **Old images:** clean them up now and then with `docker image prune -f`.

**Never run `docker compose -f docker-compose.prod.yml down -v`.** The `-v`
deletes the volumes: every policy, the audit chain, the AI call log and Caddy's
certificates. To stop everything without losing data, use `down` without `-v`.

## 7. Logs, without printing secrets

Safe to read:

```sh
docker compose -f docker-compose.prod.yml logs -f --tail=200 app
docker compose -f docker-compose.prod.yml logs -f --tail=200 caddy
docker compose -f docker-compose.prod.yml logs --tail=50 vault-init
docker compose -f docker-compose.prod.yml logs --tail=50 mongo
```

- The app logs error classes and codes only. It never logs messages, URIs or
  credentials, and audit lines carry ids and codes only.
- `vault-init` logs only what it changed, and never a token.

**Don't print the `vault` service's log as is.** At startup, Vault dev mode
prints its root token and unseal key. Filter those lines out:

```sh
docker compose -f docker-compose.prod.yml logs vault | grep -viE 'root token|unseal key'
```

These commands also print secrets, so don't run them on a shared screen or
paste their output anywhere:

- `docker compose -f docker-compose.prod.yml config` prints every interpolated
  value. `config --quiet` only validates, and is safe.
- `docker inspect` on `app`, `vault`, `vault-init` or `mongo` shows their environment.
- `env` or `printenv` inside a container.

## 8. Back up MongoDB

```sh
mkdir -p ~/backups
docker compose -f docker-compose.prod.yml exec -T mongo sh -c \
  'mongodump --quiet --archive --gzip -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db kyc_studio' \
  > ~/backups/kyc-$(date -u +%Y%m%d-%H%M).archive.gz
```

To restore, pipe the archive into `mongorestore --archive --gzip --drop` the
same way, with `exec -T mongo sh -c '...'`.
