# Persistence: MongoDB and Vault

KYC Studio runs without any services by default: policies live in JSON files,
the audit log goes to the console and AI calls go to `data/ai-calls.jsonl`.
Each store can be switched to MongoDB on its own. Customer cases (Phase 2) need
both MongoDB and Vault, because their personal data is encrypted with a
per-customer Vault Transit key before it is written.

## Start the services

The root `docker-compose.yml` runs three services for local development:

| Service      | What it does                                                                 |
|--------------|------------------------------------------------------------------------------|
| `mongo`      | MongoDB 7 with authentication, bound to `127.0.0.1:27017`, data in a volume. |
| `vault`      | Vault in **dev mode** (in memory), bound to `127.0.0.1:8200`.                 |
| `vault-init` | A loop that every 20 s makes sure Transit, the `kyc-app` policy and the app token exist. |

All three restart `unless-stopped`.

1. Create `D:\KYC studio\.env` (next to `docker-compose.yml`) from `.env.example`.
   Generate every secret as hex so it can go into a URI without escaping. In
   PowerShell, one line per value:

   ```powershell
   $b = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | % { $_.ToString('x2') })
   ```

   | Root `.env`           | Meaning                                                        |
   |-----------------------|----------------------------------------------------------------|
   | `VAULT_DEV_TOKEN`     | Vault root token. Used only by `vault-init`; never by the app. |
   | `VAULT_APP_TOKEN`     | Id of the scoped app token that `vault-init` creates (hex).    |
   | `MONGO_ROOT_USER`     | MongoDB admin user name.                                        |
   | `MONGO_ROOT_PASSWORD` | MongoDB admin password (hex, 16+ characters).                   |
   | `MONGO_APP_USER`      | App user, `readWrite` on `kyc_studio` only.                     |
   | `MONGO_APP_PASSWORD`  | App user password (hex, 16+ characters).                        |

2. **One time only**, if you ran an earlier compose file without MongoDB
   authentication, remove its volume first. The init script that creates the
   app user only runs on an empty volume:

   ```powershell
   docker compose down -v
   ```

   This deletes all MongoDB data. Don't run it again once you have data you
   want to keep.

3. Start everything: `docker compose up -d`.

4. In `frontend/.env.local` set:

   | `frontend/.env.local` | Value                                                                              |
   |-----------------------|------------------------------------------------------------------------------------|
   | `MONGODB_URI`         | `mongodb://<MONGO_APP_USER>:<MONGO_APP_PASSWORD>@127.0.0.1:27017/kyc_studio?authSource=kyc_studio` |
   | `VAULT_ADDR`          | `http://127.0.0.1:8200`                                                            |
   | `VAULT_TOKEN`         | The same value as `VAULT_APP_TOKEN`. Never the root token.                         |
   | `POLICY_STORE`        | `mongo`                                                                            |
   | `AI_CALL_LOG`         | `mongo`                                                                            |
   | `AUDIT_LOG`           | `mongo`                                                                            |
   | `APPLICATION_LOG`     | `file` until Phase 2 lands, then `mongo`                                           |
   | `ADMIN_ACCESS_CODE`   | A second secret, different from `DEMO_ACCESS_CODE`, for destructive admin actions  |

5. Open `/api/health`. It reports `mongo`, `vault`, `tokenValid`, which store
   uses which backend, and a list of warnings. `ok: true` means no warnings.

## The scoped Vault token

The app never holds the root token. `vault-init` creates a token with a fixed
id (`VAULT_APP_TOKEN`) and the policy in `docker/vault/kyc-app.hcl`, which only
allows these Transit operations on keys named `cust-<uuid>`: create, read,
encrypt, decrypt and delete. It also allows listing keys. The token is
periodic (`720h`) and orphaned. `vault-init` renews it whenever less than
7 days remain, so it does not expire while the services are running.
If the token is missing or invalid, `/api/health` says so.

## Dev-mode Vault: what is lost on restart

Dev-mode Vault keeps everything in memory. When the `vault` container
restarts, every Transit key is gone, so every case encrypted before the
restart can no longer be decrypted. This is a deliberate trade-off for a demo.
What happens next:

- Within 20 s `vault-init` recreates the Transit mount, the policy and the app
  token (same id), so new cases work again without touching the app.
- The app records Vault's cluster id in MongoDB (`system_state`). When it
  changes, `/api/health` shows **"Vault restarted: previous keys lost"**.
- `npm run seed` (Phase 3a) recreates any seed case that is missing or can no
  longer be read, and leaves other cases alone. `npm run seed -- --reset --yes`
  wipes and recreates all seed cases.

Production (Phase D) replaces dev mode with a Vault that persists to disk.

## Documents and images

Extracted personal data and the evidence boxes are encrypted with the
customer's Transit key. Uploaded document images go to GridFS **without
application-level encryption** (unless Phase 5 is done). They are protected
only by MongoDB access control and disk encryption. Erasing a customer
therefore deletes their image files as well as their key. Deleting the key
alone would not make the images unreadable.

Selfies are never stored. Only the quality check result is kept, and the case
page says "Selfie quality checked; image not retained."

## Store switches

| Variable          | Values                     | Default   |
|-------------------|----------------------------|-----------|
| `POLICY_STORE`    | `file`, `mongo`            | `file`    |
| `APPLICATION_LOG` | `file`, `mongo` (Phase 2)  | `file`    |
| `AI_CALL_LOG`     | `file`, `memory`, `mongo`  | `file`    |
| `AUDIT_LOG`       | `console`, `memory`, `mongo` | `console` |

`/api/health` warns about combinations that don't make sense:

- A store is set to `mongo` but MongoDB is down or `MONGODB_URI` is missing.
- Cases are on `mongo` but `AUDIT_LOG` is not, so case events would be missing
  from the tamper-evident chain.
- Cases are on `mongo` but Vault is down, sealed or not configured, so new
  applications can't be stored and personal data can't be revealed.
- The Vault token is invalid.
- `AUDIT_LOG=memory`: the chain is lost when the server restarts.

Admin pages whose data lives in MongoDB (`/admin/audit`, `/admin/usage`)
show what to set instead of an error when their store is not configured.

## Audit chain

Every state change appends an event to `audit_events`. Each event's hash
covers the previous event's hash, so editing, deleting or reordering any event
breaks the chain. `/admin/audit` has a **Verify** button that recomputes the
chain and names the first broken event. Events contain only ids, types,
policy versions and codes (decision, flag codes, score), never names, document
numbers or other personal data.

Appends retry for about 2 s with jitter when two writers race for the same
sequence number. If an append still fails, the request fails with
`audit_failed`. The app never skips an audit event.

## Access levels

- **Demo code** (`DEMO_ACCESS_CODE`): read-only admin pages, revealing personal
  data on a case, and everything else that calls the AI. Audit actor:
  `officer:demo`.
- **Admin code** (`ADMIN_ACCESS_CODE`, in addition to the demo code): deleting a
  customer, retention purge, seed reset and bulk wipe. If it is unset, or equal
  to the demo code, these actions are refused. Audit actor: `officer:admin`.
