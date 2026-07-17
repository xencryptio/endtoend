FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including curl for healthcheck
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt

# Copy application code
COPY . .

# Ensure the SQLite volume mount-point exists even before the volume is attached.
RUN mkdir -p /data

# Expose port
EXPOSE 8001

# Tables are auto-created at app startup via metadata.create_all() — no alembic.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--log-level", "debug"]