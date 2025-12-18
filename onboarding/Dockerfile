# Use Python 3.11 slim image for smaller size
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code - THIS IS THE KEY FIX
# Copy all Python files directly to /app instead of /app/app
COPY ./app/*.py /app/
COPY ./app/__init__.py /app/

# If you have subdirectories in app/, copy them separately if needed
# COPY ./app/subdirectory /app/subdirectory

# Create directories for uploads and temporary files
RUN mkdir -p /app/uploads /app/temp

# Expose port
EXPOSE 8008

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8008/health', timeout=5.0)" || exit 1

# Run the application - UPDATED to reflect new structure
CMD ["sh", "-c", "sleep 10 && uvicorn main:app --host 0.0.0.0 --port 8008 --workers 1 --log-level debug"]