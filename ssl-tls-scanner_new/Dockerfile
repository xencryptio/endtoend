FROM python:3.8-buster

# Use archived Debian Buster repositories
RUN sed -i 's|http://deb.debian.org/debian|http://archive.debian.org/debian|g' /etc/apt/sources.list && \
    sed -i '/security.debian.org/d' /etc/apt/sources.list

# Install build dependencies and CA certificates
RUN apt-get update && \
    apt-get install -y build-essential wget git libssl-dev ca-certificates

# Force re-add DigiCert Global Root G2 to trust store (PEM format)
COPY DigiCertGlobalRootG2.crt /usr/local/share/ca-certificates/DigiCertGlobalRootG2.crt
RUN chmod 644 /usr/local/share/ca-certificates/DigiCertGlobalRootG2.crt && update-ca-certificates --fresh

# Set up scanner code
WORKDIR /app
COPY . /app

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Relax OpenSSL config to allow legacy protocols (TLS 1.0/1.1)
RUN sed -i 's/^\(MinProtocol\|CipherString\).*/#&/' /etc/ssl/openssl.cnf

# Ensure Python uses the relaxed OpenSSL config
ENV OPENSSL_CONF=/etc/ssl/openssl.cnf

# Expose API port
EXPOSE 8010

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8010/health')" || exit 1

# Run API server
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8010"]
