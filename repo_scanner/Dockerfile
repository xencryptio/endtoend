# Backend (FastAPI - not Flask!)
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (git + build tools)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt

# Copy all source files
COPY app.py .
COPY logging_config.py .
COPY logging_middleware.py .
COPY http_client.py .
COPY exceptions.py .
COPY repo_scoring.py .

# Mount-point for shared SQLite volume.
RUN mkdir -p /data

# ✅ CHANGE PORT FROM 5000 TO 8001
EXPOSE 8001

# Tables are auto-created at app startup via Base.metadata.create_all() — no alembic.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001", "--log-level", "debug"]