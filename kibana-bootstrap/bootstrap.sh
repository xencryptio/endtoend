#!/bin/sh
# ---------------------------------------------------------------------------
# kibana-bootstrap
# ---------------------------------------------------------------------------
# Waits for Kibana to be reachable, then imports the data views + analyst
# dashboard. Idempotent: uses overwrite=true so re-runs are safe.
# Runs once per container start and exits 0 on success.
# ---------------------------------------------------------------------------

set -eu

KIBANA_URL="${KIBANA_URL:-http://kibana:5601}"
MAX_WAIT="${MAX_WAIT_SECONDS:-300}"
SLEEP="${POLL_INTERVAL_SECONDS:-5}"

echo "[bootstrap] target=$KIBANA_URL max_wait=${MAX_WAIT}s"

# ---- 1. Wait for Kibana to be ready ---------------------------------------
elapsed=0
while [ "$elapsed" -lt "$MAX_WAIT" ]; do
  status=$(curl -s -o /tmp/status.json -w "%{http_code}" \
            "$KIBANA_URL/api/status" || echo "000")
  if [ "$status" = "200" ]; then
    overall=$(sed -n 's/.*"overall":{[^}]*"level":"\([^"]*\)".*/\1/p' \
              /tmp/status.json | head -n1)
    if [ "$overall" = "available" ]; then
      echo "[bootstrap] Kibana is available (after ${elapsed}s)"
      break
    fi
    echo "[bootstrap] Kibana up but level=${overall:-unknown} (${elapsed}s)"
  else
    echo "[bootstrap] waiting for Kibana... http=$status (${elapsed}s)"
  fi
  sleep "$SLEEP"
  elapsed=$((elapsed + SLEEP))
done

if [ "$elapsed" -ge "$MAX_WAIT" ]; then
  echo "[bootstrap] ERROR: Kibana not ready after ${MAX_WAIT}s — aborting"
  exit 1
fi

# ---- 2. Import every ndjson under /import ---------------------------------
imported=0
failed=0
for f in /import/*.ndjson; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  echo "[bootstrap] importing $name"
  http=$(curl -s -o /tmp/import.json -w "%{http_code}" \
         -X POST "$KIBANA_URL/api/saved_objects/_import?overwrite=true" \
         -H "kbn-xsrf: true" \
         -F "file=@${f}")
  if [ "$http" = "200" ]; then
    echo "[bootstrap]   $name -> HTTP 200"
    head -c 500 /tmp/import.json
    echo ""
    imported=$((imported + 1))
  else
    echo "[bootstrap]   $name -> HTTP $http (FAILED)"
    head -c 1000 /tmp/import.json
    echo ""
    failed=$((failed + 1))
  fi
done

echo "[bootstrap] done: imported=$imported failed=$failed"
[ "$failed" -eq 0 ]
