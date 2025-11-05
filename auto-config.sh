#!/usr/bin/env bash
set -e

echo "⚙️ Running auto-config to replace 'localhost' dynamically..."

# ============================================================
# STEP 1 — Detect IP
# ============================================================

# ✅ Simulation override (used for local testing)
if [[ -n "$SIMULATED_AWS_IP" ]]; then
  PUBLIC_IP="$SIMULATED_AWS_IP"
  echo "🧪 Simulation enabled. Using SIMULATED_AWS_IP: $PUBLIC_IP"
else
  # ✅ Try AWS EC2 metadata public IP first (works on AWS)
  PUBLIC_IP=$(curl -s --connect-timeout 1 http://169.254.169.254/latest/meta-data/public-ipv4 || true)

  # ✅ If IMDSv2 needed (fallback)
  if [[ -z "$PUBLIC_IP" ]]; then
    TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
      -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
    PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
      http://169.254.169.254/latest/meta-data/public-ipv4 || true)
  fi
fi

# ✅ Detect internal network IP (works in Docker + Linux/macOS)
PRIVATE_IP=$(hostname -I 2>/dev/null | awk '{print $1}')

# ✅ macOS fallback network interface
if [[ -z "$PRIVATE_IP" ]]; then
  PRIVATE_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "")
fi

# ✅ Final fallback decision logic
if [[ -n "$PUBLIC_IP" ]]; then
  HOST_IP="$PUBLIC_IP"
  echo "🌍 Using PUBLIC IP: $HOST_IP"
elif [[ -n "$PRIVATE_IP" ]]; then
  HOST_IP="$PRIVATE_IP"
  echo "💻 Using PRIVATE IP: $HOST_IP"
else
  HOST_IP="localhost"
  echo "⚠️ No IP found → Using localhost"
fi

echo "📌 Final Applied IP: $HOST_IP"

# ============================================================
# STEP 2 — Files to Update
# ============================================================
FILES=(
  "./Frontend/.env"
  "./scan-service/Dockerfile"
)

# ============================================================
# STEP 3 — Safe Replace localhost → Detected IP
# ============================================================
for FILE in "${FILES[@]}"; do
  if [[ -f "$FILE" ]]; then
    echo "🔧 Updating $FILE ..."
    TMP_FILE="${FILE}.tmp"
    sed "s|localhost|$HOST_IP|g" "$FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$FILE"
  else
    echo "⚠️ File not found: $FILE"
  fi
done

echo "✅ Auto-config completed successfully!"
