# -------------------------------
#   Dockerfile for Crypto Scanner
# -------------------------------

# Use a lightweight Python base image
FROM python:3.11-slim

# Install postgresql-client for pg_isready
RUN apt-get update && apt-get install -y postgresql-client curl

# Set the working directory inside the container
WORKDIR /app

# --- Prepare requirements.txt and install dependencies ---
COPY requirements.txt .
RUN pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt

# Copy the wait-for-db.sh script and make it executable
COPY wait-for-db.sh /usr/local/bin/wait-for-db.sh
RUN chmod +x /usr/local/bin/wait-for-db.sh

# --- Copy all application code and folders ---
# Copy all Python files from system-scaner directory
COPY *.py .
COPY alembic.ini .
COPY wait-for-db.sh .
COPY alembic ./alembic
COPY agents ./agents

# --- FIX: Update hardcoded API URLs (skip dashboard.html) ---
# Removes old URL only from Linux Agent/crypto-agent.service
RUN if [ -f "agents/linux/crypto-agent.service" ]; then \
        sed -i 's|http://nipunnegi:9000||g' "agents/linux/crypto-agent.service"; \
    fi

# Expose the port for FastAPI app
EXPOSE 9000

# Use wait-for-db.sh, run migrations, then start the application
CMD /usr/local/bin/wait-for-db.sh db-service && alembic upgrade head && uvicorn api_server:app --host 0.0.0.0 --port 9000