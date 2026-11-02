#!/bin/sh
# Idempotent and long-running. A dev-mode Vault keeps everything in memory, so a
# restart loses the transit mount, the kyc-app policy and the app token. Every 20 s
# this re-creates whatever is missing and renews the token, so new submissions
# work again after a Vault restart without manual steps. It never prints a token.
#
# Env: VAULT_ADDR, VAULT_TOKEN (dev root token), VAULT_APP_TOKEN (the app's token id).
set -u

: "${VAULT_APP_TOKEN:?VAULT_APP_TOKEN must be set}"
# Vault rejects ids containing '.', and ids must not start with 's.'; we require hex.
case "$VAULT_APP_TOKEN" in
  *[!0-9a-fA-F]* | "") echo "[vault-init] VAULT_APP_TOKEN must be hex only (no '.', no 's.' prefix)"; exit 1 ;;
esac

PERIOD=720h          # periodic token: valid for 30 days after each renewal
RENEW_BELOW=604800   # renew when less than 7 days remain (seconds)

while true; do
  if vault status >/dev/null 2>&1; then
    if ! vault secrets list -format=json 2>/dev/null | grep -q '"transit/"'; then
      vault secrets enable transit >/dev/null 2>&1 && echo "[vault-init] enabled the transit engine"
    fi
    if ! vault policy read kyc-app >/dev/null 2>&1; then
      vault policy write kyc-app /kyc/kyc-app.hcl >/dev/null 2>&1 && echo "[vault-init] wrote policy kyc-app"
    fi
    if ! vault token lookup "$VAULT_APP_TOKEN" >/dev/null 2>&1; then
      vault token create -id="$VAULT_APP_TOKEN" -policy=kyc-app -period="$PERIOD" -orphan >/dev/null 2>&1 \
        && echo "[vault-init] created the app token (period $PERIOD)"
    else
      ttl=$(vault token lookup -format=json "$VAULT_APP_TOKEN" 2>/dev/null | sed -n 's/.*"ttl": *\([0-9][0-9]*\).*/\1/p' | head -n 1)
      if [ -n "$ttl" ] && [ "$ttl" -lt "$RENEW_BELOW" ]; then
        vault token renew "$VAULT_APP_TOKEN" >/dev/null 2>&1 && echo "[vault-init] renewed the app token"
      fi
    fi
  else
    echo "[vault-init] waiting for Vault"
  fi
  sleep 20
done
