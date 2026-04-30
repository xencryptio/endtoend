# OQS-OpenSSL PQ Scanner - Proper PQ hybrid detection
FROM python:3.11-bookworm

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libssl-dev \
    ninja-build \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Build liboqs (Open Quantum Safe library)
WORKDIR /tmp
RUN git clone --depth 1 --branch main https://github.com/open-quantum-safe/liboqs.git && \
    cd liboqs && \
    mkdir build && cd build && \
    cmake -GNinja -DCMAKE_INSTALL_PREFIX=/opt/oqs .. && \
    ninja && ninja install

# Build OQS-OpenSSL provider
RUN git clone --depth 1 --branch main https://github.com/open-quantum-safe/oqs-provider.git && \
    cd oqs-provider && \
    cmake -GNinja \
        -DCMAKE_PREFIX_PATH=/opt/oqs \
        -DCMAKE_INSTALL_PREFIX=/opt/oqs \
        -S . -B _build && \
    cmake --build _build && \
    cmake --install _build

# Set up environment for OQS
ENV LD_LIBRARY_PATH=/opt/oqs/lib:$LD_LIBRARY_PATH
ENV OPENSSL_MODULES=/opt/oqs/lib/ossl-modules

# Create app directory
WORKDIR /app

# Copy Python requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy scanner code
COPY . .

# Configure OpenSSL to use OQS provider
RUN mkdir -p /opt/oqs/ssl && \
    echo "[openssl_init]" > /opt/oqs/ssl/openssl.cnf && \
    echo "providers = provider_sect" >> /opt/oqs/ssl/openssl.cnf && \
    echo "" >> /opt/oqs/ssl/openssl.cnf && \
    echo "[provider_sect]" >> /opt/oqs/ssl/openssl.cnf && \
    echo "default = default_sect" >> /opt/oqs/ssl/openssl.cnf && \
    echo "oqsprovider = oqsprovider_sect" >> /opt/oqs/ssl/openssl.cnf && \
    echo "" >> /opt/oqs/ssl/openssl.cnf && \
    echo "[default_sect]" >> /opt/oqs/ssl/openssl.cnf && \
    echo "activate = 1" >> /opt/oqs/ssl/openssl.cnf && \
    echo "" >> /opt/oqs/ssl/openssl.cnf && \
    echo "[oqsprovider_sect]" >> /opt/oqs/ssl/openssl.cnf && \
    echo "activate = 1" >> /opt/oqs/ssl/openssl.cnf

ENV OPENSSL_CONF=/opt/oqs/ssl/openssl.cnf

# Expose API port
EXPOSE 8011

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8011/health')" || exit 1

# Run API server
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8011"]
 