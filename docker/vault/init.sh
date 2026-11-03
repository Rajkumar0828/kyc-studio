#!/bin/sh
# Idempotent and long-running. A dev-mode Vault keeps everything in memory, so a
# restart loses the transit mount, the kyc-app policy and the app token. Every 20 s
# this checks each of them and re-creates only what is actually missing, then
# renews the token when it is close to expiry. It never prints a token.
#
# Quiet when nothing changes: it logs only when it creates or renews something,
# when Vault's cluster id changes (a restart), and when Vault becomes reachable or
# unreachable. A check that fails (Vault still starting, network blip) is not
# treated as "missing": that pass is skipped and retried, so nothing is
# re-enabled or rewritten by mistake.
#
# Env: VAULT_ADDR, VAULT_TOKEN (dev root token), VAULT_APP_TOKEN (the app's token id).
# Tests only: VAULT_INIT_PASSES (stop after N passes; default 0 = forever),
# VAULT_INIT_SLEEP (seconds between passes; default 20).
set -u

: "${VAULT_APP_TOKEN:?VAULT_APP_TOKEN must be set}"
# Vault rejects ids containing '.', and ids must not start with 's.'; we require hex.
case "$VAULT_APP_TOKEN" in
  *[!0-9a-fA-F]* | "") echo "[vault-init] VAULT_APP_TOKEN must be hex only (no '.', no 's.' prefix)"; exit 1 ;;
esac

PERIOD=720h          # periodic token: valid for 30 days after each renewal
RENEW_BELOW=604800   # renew when less than 7 days remain (seconds)
PASSES=${VAULT_INIT_PASSES:-0}
SLEEP=${VAULT_INIT_SLEEP:-20}

log() { echo "[vault-init] $*"; }

# One pass. Returns non-zero when a check could not be made (retry next pass).
ensure() {
  # transit mount: list must succeed before "not listed" means "missing".
  mounts=$(vault secrets list -format=json 2>/dev/null) || { log "could not list secrets engines; retrying"; return 1; }
  if ! printf '%s' "$mounts" | grep -q '"transit/"'; then
    vault secrets enable transit >/dev/null 2>&1 && log "enabled the transit engine" || { log "could not enable transit; retrying"; return 1; }
  fi

  # policy: read exits 2 on a connection/permission error; only a "no policy" answer means missing.
  if ! out=$(vault policy read kyc-app 2>&1); then
    case "$out" in
      *"No policy named"*) vault policy write kyc-app /kyc/kyc-app.hcl >/dev/null 2>&1 && log "wrote policy kyc-app" || { log "could not write policy; retrying"; return 1; } ;;
      *) log "could not read policy kyc-app; retrying"; return 1 ;;
    esac
  fi

  # app token: create only when Vault says it does not exist.
  if ! info=$(vault token lookup -format=json "$VAULT_APP_TOKEN" 2>&1); then
    case "$info" in
      *"bad token"* | *"invalid token"* | *"not found"*)
        vault token create -id="$VAULT_APP_TOKEN" -policy=kyc-app -period="$PERIOD" -orphan >/dev/null 2>&1 \
          && log "created the app token (period $PERIOD)" || { log "could not create the app token; retrying"; return 1; } ;;
      *) log "could not look up the app token; retrying"; return 1 ;;
    esac
  else
    ttl=$(printf '%s' "$info" | sed -n 's/.*"ttl": *\([0-9][0-9]*\).*/\1/p' | head -n 1)
    if [ -n "$ttl" ] && [ "$ttl" -lt "$RENEW_BELOW" ]; then
      vault token renew "$VAULT_APP_TOKEN" >/dev/null 2>&1 && log "renewed the app token"
    fi
  fi
  return 0
}

last_cluster=""
reachable=unknown
pass=0
while :; do
  pass=$((pass + 1))
  if status=$(vault status -format=json 2>/dev/null); then
    [ "$reachable" = yes ] || log "Vault is reachable"
    reachable=yes
    cluster=$(printf '%s' "$status" | sed -n 's/.*"cluster_id": *"\([^"]*\)".*/\1/p' | head -n 1)
    if [ -n "$last_cluster" ] && [ -n "$cluster" ] && [ "$cluster" != "$last_cluster" ]; then
      log "Vault restarted (new cluster id): previous keys are lost; re-creating what is missing"
    fi
    [ -n "$cluster" ] && last_cluster=$cluster
    ensure
  else
    [ "$reachable" = no ] || log "waiting for Vault"
    reachable=no
  fi
  [ "$PASSES" -gt 0 ] && [ "$pass" -ge "$PASSES" ] && exit 0
  sleep "$SLEEP"
done
