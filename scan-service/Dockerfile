# ============================================================================
# SSL Labs Scanner with Quantum Safety Analysis
# ============================================================================
FROM python:3.11-slim

WORKDIR /app

# ============================================================================
# STAGE 1: Install system dependencies
# ============================================================================
RUN apt-get update && apt-get install -y \
    # Go compiler for ssllabs-scan
    golang \
    git \
    # Network utilities for health checks
    curl \
    # Cleanup to reduce image size
    && rm -rf /var/lib/apt/lists/*

# ============================================================================
# STAGE 2: Install ssllabs-scan CLI (Go binary)
# ============================================================================
RUN go install github.com/ssllabs/ssllabs-scan@latest

# Add Go binaries to PATH
ENV PATH="/root/go/bin:${PATH}"

# Verify ssllabs-scan installation
RUN ssllabs-scan --help

# ============================================================================
# STAGE 3: Install Python dependencies
# ============================================================================
COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ============================================================================
# STAGE 4: Copy application code (FIXED - Copy ALL Python files)
# ============================================================================
COPY crypto_audit.py .
COPY tls.py .
COPY db_handler.py .

# ============================================================================
# STAGE 5: Configuration
# ============================================================================

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "crypto_audit:app", "--host", "0.0.0.0", "--port", "8000"]