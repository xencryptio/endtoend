# OQS-OpenSSL PQ Scanner - Proper PQ hybrid detection
# Dependencies stored locally to avoid reliance on external GitHub repos
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

# Copy local OQS dependencies (no external GitHub dependency!)
WORKDIR /opt/oqs-build
COPY oqs-dependencies/liboqs ./liboqs
COPY oqs-dependencies/oqs-provider ./oqs-provider

# Build liboqs (Open Quantum Safe library) from local copy
WORKDIR /opt/oqs-build/liboqs
RUN mkdir build && cd build && \
    cmake -GNinja \
        -DCMAKE_INSTALL_PREFIX=/opt/oqs \
        -DBUILD_TESTING=OFF \
        -DBUILD_SHARED_LIBS=ON \
        .. && \
    ninja && ninja install

# Build OQS-OpenSSL provider from local copy
WORKDIR /opt/oqs-build/oqs-provider
RUN cmake -GNinja \
        -DCMAKE_PREFIX_PATH=/opt/oqs \
        -DCMAKE_INSTALL_PREFIX=/opt/oqs \
        -DBUILD_TESTING=OFF \
        -S . -B _build && \
    cmake --build _build && \
    cmake --install _build

# Clean up build directory to reduce image size
RUN rm -rf /opt/oqs-build

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
# The provider .so lands in the system ossl-modules directory during build.
RUN OQS_MODULE=$(find /usr/lib -name 'oqsprovider.so' 2>/dev/null | head -1) && \
    mkdir -p /opt/oqs/ssl && \
    printf '%s\n' \
      'openssl_conf = openssl_init' \
      '' \
      '[openssl_init]' \
      'providers = provider_sect' \
      '' \
      '[provider_sect]' \
      'default = default_sect' \
      'oqsprovider = oqsprovider_sect' \
      '' \
      '[default_sect]' \
      'activate = 1' \
      '' \
      '[oqsprovider_sect]' \
      'activate = 1' \
      "module = ${OQS_MODULE}" \
      > /opt/oqs/ssl/openssl.cnf && \
    echo "OQS provider module: ${OQS_MODULE}" && \
    OPENSSL_CONF=/opt/oqs/ssl/openssl.cnf openssl list -kem-algorithms 2>&1 | grep -i mlkem | head -5

ENV OPENSSL_CONF=/opt/oqs/ssl/openssl.cnf

# Expose API port
EXPOSE 8011

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8011/health')" || exit 1

# Run API server
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8011"]
 