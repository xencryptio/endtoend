#!/usr/bin/env bash
set -e

echo "⚙️ Running auto-config to replace 'localhost' dynamically..."

# Detect IP — prefer private interface (Linux/macOS)
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')

# Fallback for systems like macOS (where hostname -I may not exist)
if [[ -z "$HOST_IP" ]]; then
  HOST_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
fi

if [[ -z "$HOST_IP" ]]; then
  HOST_IP="localhost"
fi

echo "✅ Detected host IP: $HOST_IP"

FILES=(
  "./Frontend/.env"
  "./scan-service/Dockerfile"
)

for FILE in "${FILES[@]}"; do
  if [[ -f "$FILE" ]]; then
    echo "🔧 Updating $FILE ..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i ".bak" "s|localhost|$HOST_IP|g" "$FILE"
    else
      sed -i.bak "s|localhost|$HOST_IP|g" "$FILE"
    fi
  else
    echo "⚠️ Missing file: $FILE"
  fi
done

echo "✅ Configuration updated successfully!"
