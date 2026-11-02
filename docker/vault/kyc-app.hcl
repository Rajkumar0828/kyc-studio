# Least privilege for the KYC Studio app: only per-customer transit keys (cust-*).
# The token created by init.sh carries this policy plus Vault's "default" policy,
# which allows auth/token/lookup-self (used by /api/health).

# Create a customer key on first use, read it, and delete it on erasure.
path "transit/keys/cust-*" {
  capabilities = ["create", "update", "read", "delete"]
}

# Set deletion_allowed before deleting a key.
path "transit/keys/cust-*/config" {
  capabilities = ["update"]
}

# List key names for `npm run seed -- --reset --yes` (names are cust-<uuid>, no PII).
path "transit/keys" {
  capabilities = ["list"]
}

path "transit/encrypt/cust-*" {
  capabilities = ["update"]
}

path "transit/decrypt/cust-*" {
  capabilities = ["update"]
}

# Phase 5 only (image envelope encryption with per-file data keys).
path "transit/datakey/plaintext/cust-*" {
  capabilities = ["update"]
}
