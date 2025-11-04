#!/usr/bin/env bash
set -e

echo "⚙️ Running auto-config to replace 'localhost' dynamically..."

# ============================================================
# STEP 1: Try to detect the most useful IP address
# ============================================================

# If running on AWS/GCP/Azure, try to fetch the public IP
PUBLIC_IP=$(curl -s --connect-timeout 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)

# Fallback: detect internal IP (Linux/macOS)
PRIVATE_IP=$(hostname -I 2>/dev/null | awk '{print $1}')

# Fallback for macOS or Windows (ipconfig)
if [[ -z "$PRIVATE_IP" ]]; then
  PRIVATE_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "")
fi

# Final decision logic
if [[ -n "$PUBLIC_IP" ]]; then
  HOST_IP="$PUBLIC_IP"
  echo "🌍 Detected cloud environment (AWS/GCP/Azure). Using PUBLIC IP: $HOST_IP"
elif [[ -n "$PRIVATE_IP" ]]; then
  HOST_IP="$PRIVATE_IP"
  echo "💻 Detected local/private environment. Using PRIVATE IP: $HOST_IP"
else
  HOST_IP="localhost"
  echo "⚠️ Could not detect IP automatically. Falling back to localhost."
fi

# ============================================================
# STEP 2: Define files to modify
# ============================================================
FILES=(
  "./Frontend/.env"
  "./scan-service/Dockerfile"
)

# ============================================================
# STEP 3: Perform safe replacements (works everywhere)
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
