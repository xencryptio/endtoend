# -------------------------------
#   Dockerfile for Crypto Scanner
# -------------------------------

# Use a lightweight Python base image
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# --- Prepare requirements.txt and install dependencies ---
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Copy all application code and folders ---
COPY . .

# --- FIX: Update hardcoded API URLs (skip dashboard.html) ---
# Removes old URL only from Linux Agent/crypto-agent.service
RUN if [ -f "Linux Agent/crypto-agent.service" ]; then \
        sed -i 's|http://nipunnegi:9000||g' "Linux Agent/crypto-agent.service"; \
    fi

# Expose the port for FastAPI app
EXPOSE 9000

# Default startup command
CMD ["python", "api_server.py"]
