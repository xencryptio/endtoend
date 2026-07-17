# -------------------------------
#   Dockerfile for Crypto Scanner
# -------------------------------

# Use a lightweight Python base image
FROM python:3.11-slim

# Minimal runtime tools
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# --- Prepare requirements.txt and install dependencies ---
COPY requirements.txt .
RUN pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt

# --- Copy all application code and folders ---
# Copy all Python files from system-scaner directory
COPY *.py .
COPY agents ./agents

# Mount-point for shared SQLite volume.
RUN mkdir -p /data

# --- FIX: Update hardcoded API URLs (skip dashboard.html) ---
# Removes old URL only from Linux Agent/crypto-agent.service
RUN if [ -f "agents/linux/crypto-agent.service" ]; then \
        sed -i 's|http://nipunnegi:9000||g' "agents/linux/crypto-agent.service"; \
    fi

# Expose the port for FastAPI app
EXPOSE 9000

# Tables are auto-created at app startup via Base.metadata.create_all() — no alembic.
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "9000"]