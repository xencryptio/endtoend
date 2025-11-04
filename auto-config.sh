#!/usr/bin/env bash
set -e

echo "⚙️ Running auto-config to replace 'localhost' dynamically...'"

# ---------------------------
# SIMULATION MODE (optional)
# If SIMULATED_AWS_IP is set, treat it as the public IP.
# ---------------------------
if [[ -n "$SIMULATED_AWS_IP" ]]; then
  PUBLIC_IP="$SIMULATED_AWS_IP"
  echo "🧪 Simulation active. Using SIMULATED_AWS_IP: $PUBLIC_IP"
else
  # Try to fetch public IP from cloud metadata (works on real cloud hosts)
  PUBLIC_IP=$(curl -s --connect-timeout 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)

  # Try IMDSv2 if needed
  if [[ -z "$PUBLIC_IP" ]]; then
    TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
      -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
    PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
      http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)
  fi
fi

# Detect internal IP (works on Linux/macOS)
PRIVATE_IP=$(hostname -I 2>/dev/null | awk '{print $1}')

# macOS/other fallback
if [[ -z "$PRIVATE_IP" ]]; then
  PRIVATE_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "")
fi

# Final decision
if [[ -n "$PUBLIC_IP" ]]; then
  HOST_IP="$PUBLIC_IP"
  echo "🌍 Using PUBLIC IP: $HOST_IP"
elif [[ -n "$PRIVATE_IP" ]]; then
  HOST_IP="$PRIVATE_IP"
  echo "💻 Using PRIVATE IP: $HOST_IP"
else
  HOST_IP="localhost"
  echo "⚠️ Could not detect any IP. Falling back to localhost."
fi

# ============================================================
# STEP 2: Define Files to Modify
# ============================================================
FILES=(
  "./Frontend/.env"
  "./Frontend/.env.development"
  "./scan-service/Dockerfile"
  "./docker-compose.yml"
)

# ============================================================
# STEP 3: Perform Safe Cross-Platform Replacement
# ============================================================
for FILE in "${FILES[@]}"; do
  if [[ -f "$FILE" ]]; then
    echo "🔧 Updating $FILE ..."
    TMP_FILE="${FILE}.tmp"
    sed "s|localhost|$HOST_IP|g" "$FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$FILE"
  else
    echo "⚠️ Missing file: $FILE"
  fi
done

echo "✅ Configuration updated successfully!"
