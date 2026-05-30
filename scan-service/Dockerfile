# ============================================================================
# SSL Labs Scanner with Quantum Safety Analysis
# ============================================================================
FROM python:3.11-slim

WORKDIR /app

# ============================================================================
# STAGE 1: Install system dependencies
# ============================================================================
RUN apt-get update && apt-get install -y \
    # Network utilities for health checks
    curl \
    # Cleanup to reduce image size
    && rm -rf /var/lib/apt/lists/*

# ============================================================================
# STAGE 2: Install Python dependencies
# ============================================================================
COPY requirements.txt .
RUN pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt

# ============================================================================
# STAGE 3: Copy ALL Python files and tls_scanner package
# ============================================================================
# Copy root-level Python files
COPY *.py .

# Copy tls_scanner package
COPY tls_scanner/ ./tls_scanner/

# ============================================================================
# STAGE 4: Configuration
# ============================================================================

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "crypto_audit:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "debug"]