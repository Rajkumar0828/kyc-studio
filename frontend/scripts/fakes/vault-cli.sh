#!/bin/sh
# Fake `vault` CLI for scripts/vault-init-test.ts. State lives in files under
# $FAKE_STATE; every mutating call is appended to $FAKE_STATE/calls.
# Scenario files (optional), keyed by the number of `vault status` calls so far:
#   down_until N     status fails while the count is <= N
#   restart_at N     on status call N: wipe transit/policy/token, new cluster id
#   faillist_at N    secrets list fails with a connection error on pass N
#   failpolicy_at N  policy read fails with a connection error on pass N
S=$FAKE_STATE
n=$(cat "$S/n" 2>/dev/null || echo 0)
at() { [ -f "$S/$1" ] && [ "$(cat "$S/$1")" = "$n" ]; }

case "$1 $2" in
  "status -format=json")
    n=$((n + 1)); echo "$n" > "$S/n"
    if [ -f "$S/down_until" ] && [ "$n" -le "$(cat "$S/down_until")" ]; then echo "connection refused" >&2; exit 2; fi
    if at restart_at; then rm -f "$S/transit" "$S/policy" "$S/token"; echo "cluster-$n" > "$S/cluster"; fi
    [ -f "$S/cluster" ] || echo "cluster-0" > "$S/cluster"
    printf '{\n  "sealed": false,\n  "cluster_id": "%s"\n}\n' "$(cat "$S/cluster")"
    ;;
  "secrets list")
    if at faillist_at; then echo "dial tcp: connection refused" >&2; exit 2; fi
    if [ -f "$S/transit" ]; then printf '{\n  "sys/": {},\n  "transit/": {}\n}\n'; else printf '{\n  "sys/": {}\n}\n'; fi
    ;;
  "secrets enable")
    if [ -f "$S/transit" ]; then echo "path is already in use at transit/" >&2; exit 2; fi
    touch "$S/transit"; echo enable >> "$S/calls"
    ;;
  "policy read")
    if at failpolicy_at; then echo "dial tcp: connection refused" >&2; exit 2; fi
    if [ -f "$S/policy" ]; then echo 'path "transit/keys/cust-*" {}'; else echo "No policy named: kyc-app" >&2; exit 2; fi
    ;;
  "policy write")
    touch "$S/policy"; echo policy_write >> "$S/calls"
    ;;
  "token lookup")
    if [ -f "$S/token" ]; then printf '{\n  "data": {\n    "ttl": 2591000\n  }\n}\n'; else printf 'Error looking up token: Code: 403. Errors:\n\n* bad token\n' >&2; exit 2; fi
    ;;
  "token create")
    touch "$S/token"; echo token_create >> "$S/calls"
    ;;
  "token renew")
    echo token_renew >> "$S/calls"
    ;;
  *)
    echo "fake vault: unsupported: $*" >&2; exit 3
    ;;
esac
