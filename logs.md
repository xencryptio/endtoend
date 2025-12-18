# Architecture and Logging Strategy

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Core Components Added](#core-components-added)
- [Service-by-Service Changes](#service-by-service-changes)
- [Log Management](#log-management)
- [Error Handling Strategy](#error-handling-strategy)
- [HTTP Communication](#http-communication)
- [Operational Guide](#operational-guide)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Before Migration

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Service   │────▶│   Service   │────▶│   Service   │
│   A         │     │   B         │     │   C         │
└─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │
      ▼                   ▼                   ▼
 [Local Log]        [Local Log]        [Local Log]
 (Unstructured)     (Unstructured)     (Unstructured)
 No Correlation     No Correlation     No Correlation
```

### After Migration

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Service   │────▶│   Service   │────▶│   Service   │
│   A         │     │   B         │     │   C         │
│ [Corr: ABC] │     │ [Corr: ABC] │     │ [Corr: ABC] │
└─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │
      ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────┐
│            Unified Logging System                   │
│  - Structured JSON logs                             │
│  - Correlation ID tracking                          │
│  - Service-specific prefixes                        │
│  - Standardized error codes                         │
└─────────────────────────────────────────────────────┘
```

---

## Core Components Added

### 1. `logging_config.py` (New Module)

- **Location**: Added to all service directories
- **Purpose**: Centralized logging configuration with structured output.
- **Key Features**:
  ```python
  def setup_logging(service_name: str, log_level: int = logging.INFO):
      # Creates service-prefixed logs: `[SCAN-SERVICE]`, `[DB-SERVICE]`, etc.
      # Structured JSON-like format: `timestamp - level - message`
      # Configures both file and console handlers
      # Sets appropriate log levels per environment
  ```
- **Example Output**:
  ```
  2025-12-18 14:23:45,123 - SCAN-SERVICE - INFO - Starting scan for example.com
  2025-12-18 14:23:46,456 - SCAN-SERVICE - DEBUG - Protocol detection: HTTPS
  2025-12-18 14:23:47,789 - SCAN-SERVICE - ERROR - Scan failed: Connection timeout
  ```

### 2. `logging_middleware.py` (New Module)

- **Location**: Added to all service directories
- **Purpose**: Request tracing with correlation IDs.
- **Key Features**:
  ```python
  async def correlation_middleware(request: Request, call_next):
      # Generates unique correlation ID for each request
      # Propagates correlation ID across service boundaries
      # Logs request start/end with timing information
      # Attaches correlation ID to all log messages in request context
  ```
- **Correlation ID Flow**:
  ```
  User Request → [Corr-ID: abc123] → Frontend
                       ↓
  Frontend → [Corr-ID: abc123] → Scan-Service
                       ↓
  Scan-Service → [Corr-ID: abc123] → DB-Service
  ```
- **Example Log Trail**:
  ```
  [Corr-ID: abc123] [FRONTEND] User initiated scan
  [Corr-ID: abc123] [SCAN-SERVICE] Processing domain: example.com
  [Corr-ID: abc123] [DB-SERVICE] Saving scan result
  [Corr-ID: abc123] [SCAN-SERVICE] Scan completed
  [Corr-ID: abc123] [FRONTEND] Response sent
  ```

### 3. `http_client.py` (New Module)

- **Location**: Added to all service directories
- **Purpose**: Resilient HTTP communication with retry logic.
- **Key Features**:
  ```python
  async def call_service(
      method: str,
      url: str,
      timeout: float = 30.0,
      max_retries: int = 3,
      **kwargs
  ):
      # Automatic Retries: Retries failed requests with exponential backoff
      # Timeout Management: Prevents hanging requests
      # Error Handling: Converts HTTP errors to structured exceptions
      # Logging: Logs all HTTP operations with correlation IDs
      # Connection Pooling: Reuses HTTP connections for efficiency
  ```
- **Retry Strategy**:
  ```
  Attempt 1: Immediate
  Attempt 2: Wait 1 second
  Attempt 3: Wait 2 seconds
  Attempt 4: Wait 4 seconds (if max_retries=4)
  ```
- **Example Usage**:
  ```python
  # Old way (fragile)
  response = await httpx.get("http://api/endpoint")
  data = response.json()

  # New way (resilient)
  data = await call_service("GET", "http://api/endpoint")
  ```

### 4. `exceptions.py` (New Module)

- **Location**: Added to all service directories
- **Purpose**: Standardized error handling across all services.
- **Key Features**:
  ```python
  class APIError(HTTPException):
      def __init__(
          self,
          status_code: int,
          error_code: str,
          message: str,
          details: Any = None
      ):
          ...
  ```
- **Standard Error Response**:
  ```json
  {
    "detail": {
      "error": "batch_not_found",
      "message": "Scan batch abc123 not found",
      "timestamp": "2025-12-18T14:23:45.123456"
    }
  }
  ```
- **Error Code Categories**:
  - `validation_error`: Request validation failures
  - `batch_not_found`: Resource not found
  - `network_error`: HTTP communication failures
  - `internal_error`: Unexpected server errors
  - `scan_failed`: Domain-specific errors

---

## Service-by-Service Changes

### 1. Frontend Service

- **Files Modified**:
  - `Frontend/Dockerfile` ✓
  - `Frontend/src/components/scan/webscan.tsx` ✓
  - `Frontend/src/components/vulnerabilities/VulnerabilityCategoryTable.tsx` ✓
  - `Frontend/src/main.tsx` ✓
  - `Frontend/src/pages/SSL-TLS scans.tsx` ✓
- **New Files Created**:
  - `Frontend/src/lib/api.ts` (New - API client wrapper)

#### Changes:

- **`webscan.tsx`**:
  - Replaced `fetch()` with `apiFetch()` for all API calls.
  - Added error handling with structured error codes.
  - Improved loading states and error messages.
- **Impact**:
  - All network errors now logged with correlation IDs.
  - Automatic retry on transient failures.
  - Better UX with specific error messages.

- **Before**:
  ```typescript
  const response = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  });
  if (response.ok) {
    const data = await response.json();
    // Handle success
  }
  ```
- **After**:
  ```typescript
  const response = await apiFetch(deleteUrl, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  });
  if (response) {
    // Response already parsed
    console.log('✅ Deleted successfully:', response);
  }
  ```

- **`Dockerfile`**:
  - Added unbuffered logging (`FORCE_COLOR=1`).
  - Added `--clearScreen=false` for cleaner Docker logs.
- **Impact**: Real-time log visibility in Docker.

### 2. Scan Service

- **Files Modified**:
  - `scan-service/Dockerfile` ✓
  - `scan-service/crypto_audit.py` ✓
  - `scan-service/db_handler.py` ✓
  - `scan-service/requirements.txt` ✓
- **New Files Created**:
  - `scan-service/logging_config.py` ✓
  - `scan-service/logging_middleware.py` ✓
  - `scan-service/http_client.py` ✓
  - `scan-service/exceptions.py` ✓

#### Changes:

- **`crypto_audit.py`**:
  - Added startup event with database connection verification.
  - Replaced `print()` with `logger.info()` throughout.
  - Added exception handlers for validation and generic errors.
  - Added `@app.middleware("http")(correlation_middleware)`.
- **Impact**:
  - All scan operations now traceable via correlation ID.
  - Database connection verified on startup.
  - Structured error responses for all failures.
- **Key Log Points Added**:
  ```python
  logger.info("Entered /scan endpoint")
  logger.info("Protocol Check and Filtering...")
  logger.info(f"Scanning {len(domains_to_scan)} HTTPS domains")
  logger.info("Scan completed successfully")
  logger.exception("Scan failed")  # Includes full stack trace
  ```

- **`db_handler.py`**:
  - Converted synchronous operations to asynchronous.
  - Replaced `requests` with `httpx` using `call_service()`.
  - Added connection verification with `_ensure_connected()`.
- **Impact**:
  - Non-blocking database operations.
  - Automatic retry on database connection failures.
  - Better error messages for debugging.

- **Before (Synchronous)**:
  ```python
  def create_scan_batch(self, batch_id: str, total_urls: int):
      response = requests.post(url, json=payload, timeout=10)
      if response.status_code == 200:
          return True
  ```
- **After (Asynchronous)**:
  ```python
  async def create_scan_batch(self, batch_id: str, total_urls: int):
      await self._ensure_connected()
      response = await call_service("POST", url, json=payload, timeout=10)
      return response.status_code in (200, 201)
  ```

### 3. DB Service

- **Files Modified**:
  - `db-service/Dockerfile` ✓
  - `db-service/main.py` ✓
  - `db-service/crud.py` ✓
  - `db-service/requirements.txt` ✓
- **New Files Created**:
  - `db-service/logging_config.py` ✓
  - `db-service/logging_middleware.py` ✓
  - `db-service/exceptions.py` ✓

#### Changes:

- **`main.py`**:
  - Added global exception handlers.
  - Added request validation error handler.
  - Added correlation middleware.
  - Wrapped all endpoints with `try-catch` and logging.
- **Impact**:
  - All database errors now return structured responses.
  - Request/response logged with correlation IDs.
  - Better debugging for database issues.
- **Exception Handler Example**:
  ```python
  @app.exception_handler(RequestValidationError)
  async def validation_exception_handler(request: Request, exc: RequestValidationError):
      logger.error(f"Validation error: {exc.errors()}")
      return JSONResponse(
          status_code=422,
          content={
              "detail": {
                  "error": "validation_error",
                  "message": "Request validation failed",
                  "errors": exc.errors(),
                  "timestamp": datetime.now().isoformat()
              }
          }
      )
  ```

- **`crud.py`**:
  - Replaced `print()` with `logger.info()`, `logger.warning()`, and `logger.exception()`.
  - Removed verbose debug prints.
  - Added structured log messages.
- **Impact**:
  - Cleaner, easier-to-parse logs.
  - Consistent log levels.
  - Better performance (less I/O).

- **Before**:
  ```
  print(f"\n{'='*60}")
  print(f"🔵 DB-SERVICE: Creating scan result")
  print(f"   URL: {scan_data.get('url')}")
  print(f"   Status: {scan_data.get('status')}")
  print(f"{'='*60}\n")
  ```
- **After**:
  ```python
  logger.info(f"Creating scan result for URL: {scan_data.get('url')}, Status: {scan_data.get('status')}")
  ```

### 4. Repository Scanner Service

- **Files Modified**:
  - `repo_scanner/Dockerfile` ✓
  - `repo_scanner/app.py` ✓
  - `repo_scanner/requirements.txt` ✓
- **New Files Created**:
  - `repo_scanner/logging_config.py` ✓
  - `repo_scanner/logging_middleware.py` ✓
  - `repo_scanner/http_client.py` ✓
  - `repo_scanner/exceptions.py` ✓

#### Changes:

- **`app.py`**:
  - Replaced `logging.basicConfig()` with `setup_logging("REPO-SCANNER", logging.DEBUG)`.
  - Added exception handlers for validation and generic errors.
  - Added a health check endpoint.
  - Wrapped all endpoints with `try-catch`.
- **Impact**:
  - Repository scan failures are now traceable.
  - Consistent error responses.
  - Better integration with the frontend.

### 5. Onboarding Service

- **Files Modified**:
  - `onboarding/Dockerfile` ✓ (Critical path fix)
  - `onboarding/app/main.py` ✓
  - `onboarding/requirements.txt` ✓
- **New Files Created**:
  - `onboarding/logging_config.py` ✓
  - `onboarding/logging_middleware.py` ✓
  - `onboarding/http_client.py` ✓
  - `onboarding/exceptions.py` ✓

#### Critical Dockerfile Fix:

- **Before (Broken)**:
  ```dockerfile
  COPY ./app /app/app
  CMD ["uvicorn", "app.main:app", ...]
  ```
- **After (Fixed)**:
  ```dockerfile
  COPY ./app/*.py /app/
  CMD ["uvicorn", "main:app", ...]
  ```
- **Impact**: Service now starts correctly in Docker.

#### `main.py` Changes:

- Added event loop management for threaded operations.
- Replaced `asyncio.run()` with proper event loop creation.
- Added structured error handling.
- **Impact**:
  - Excel batch scans now work reliably.
  - Better error messages for upload failures.

### 6. System Scanner Service

- **Files Modified**:
  - `system-scaner/Dockerfile` ✓
  - `system-scaner/api_server.py` ✓
  - `system-scaner/requirements.txt` ✓
- **Files Modified in Agents**:
  - `system-scaner/agents/linux/Dockerfile.modern` ✓
  - `system-scaner/agents/linux/Dockerfile.legacy` ✓
  - `system-scaner/agents/linux/Dockerfile.mixed` ✓
  - `system-scaner/agents/linux/crypto_agent_service.py` ✓
  - `system-scaner/agents/windows/crypto_agent_service_windows.py` ✓
- **New Files Added to Agents**:
  - `logging_config.py` ✓
  - `logging_middleware.py` ✓
  - `http_client.py` ✓
  - `exceptions.py` ✓

#### Changes:

- **Agent Service Changes**:
  - Replaced `requests` with `httpx` and `call_service()`.
  - Added async support for HTTP operations.
  - Added structured logging.
- **Impact**:
  - Agents now retry failed connections to the API server.
  - Better error messages when the server is unreachable.
  - Audit results are delivered reliably.

- **Windows Agent Specific**:
  - Fixed a missing platform attribute reference.
  - Added an environment variable for the agent profile.
- **Impact**: Windows agents now deploy without errors.

### 7. Universal Scoring Service

- **Files Modified**:
  - `universal-scoring-service/Dockerfile` ✓
  - `universal-scoring-service/app.py` ✓
  - `universal-scoring-service/routers/scoring.py` ✓
  - `universal-scoring-service/requirements.txt` ✓
- **New Files Created**:
  - `universal-scoring-service/logging_config.py` ✓
  - `universal-scoring-service/logging_middleware.py` ✓
  - `universal-scoring-service/exceptions.py` ✓

#### Changes:

- **`scoring.py`**:
  - Added entry/exit logging for all endpoints.
  - Replaced generic exceptions with `APIError`.
- **Impact**:
  - Scoring failures now have clear error codes.
  - Performance metrics are available via log timing.
  - Better debugging for scoring issues.

### 8. Docker Compose

- **File Modified**:
  - `docker-compose.yml` ✓

#### Changes:

- Added logging configuration for all services:
  ```yaml
  logging:
    driver: json-file
    options:
      max-size: "10m"
      max-file: "5"
  ```
- **Impact**:
  - **Log Rotation**: Prevents disk space exhaustion.
  - **Log Retention**: Keeps the last 5 log files (50MB total per service).
  - **Performance**: Prevents Docker from consuming excessive memory.

---

## Log Management

### Log Storage Locations

#### Docker Environment (Production)

```
/var/lib/docker/containers/
└── <container-id>/
    ├── <container-id>-json.log      # Current log (max 10MB)
    ├── <container-id>-json.log.1    # Rotated log
    ├── <container-id>-json.log.2    # Rotated log
    ├── <container-id>-json.log.3    # Rotated log
    ├── <container-id>-json.log.4    # Rotated log
    └── <container-id>-json.log.5    # Oldest (deleted when new rotation)
```

#### Viewing Logs

- **Real-time (Live Tail)**:
  ```bash
  # View all logs from a service
  docker-compose logs -f scan-service

  # View logs with timestamps
  docker-compose logs -f --timestamps scan-service

  # View logs from multiple services
  docker-compose logs -f scan-service db-service

  # View last 100 lines
  docker-compose logs --tail=100 scan-service
  ```

- **Searching Logs**:
  ```bash
  # Find all ERROR logs
  docker-compose logs scan-service | grep ERROR

  # Find logs for specific correlation ID
  docker-compose logs | grep "abc123"

  # Find all logs for a specific domain
  docker-compose logs scan-service | grep "example.com"

  # Count error occurrences
  docker-compose logs scan-service | grep -c "ERROR"
  ```

- **Exporting Logs**:
  ```bash
  # Export to file
  docker-compose logs scan-service > scan-service.log

  # Export with timestamps
  docker-compose logs --timestamps scan-service > scan-service.log

  # Export all services
  docker-compose logs > all-services.log
  ```

### Log File Structure

#### Service-Specific Logs

Each service creates logs with this pattern:

```
[TIMESTAMP] - [SERVICE-NAME] - [LEVEL] - [MESSAGE]
2025-12-18 14:23:45,123 - SCAN-SERVICE - INFO - Scan started
2025-12-18 14:23:45,456 - SCAN-SERVICE - DEBUG - Processing domain
2025-12-18 14:23:45,789 - SCAN-SERVICE - ERROR - Scan failed
```

#### Correlation ID Tracking

Logs with correlation IDs appear as:

```
[Corr-ID: abc123] [SCAN-SERVICE] Scan started for example.com
[Corr-ID: abc123] [DB-SERVICE] Saving scan result
[Corr-ID: abc123] [SCORING-SERVICE] Calculating score
[Corr-ID: abc123] [DB-SERVICE] Result saved
```

### Log Analysis Tools

- **Using `jq` (JSON Parsing)**:
  ```bash
  # Extract all error messages
  docker-compose logs --json scan-service | jq 'select(.level=="ERROR") | .message'

  # Find logs by timestamp
  docker-compose logs --json scan-service | jq 'select(.timestamp > "2025-12-18T14:00:00")'

  # Count errors by service
  docker-compose logs --json | jq 'select(.level=="ERROR") | .service' | sort | uniq -c
  ```

- **Using `grep` and `awk`**:
  ```bash
  # Extract all scan URLs
  docker-compose logs scan-service | grep "Scanning" | awk '{print $NF}'

  # Find slow requests (>5 seconds)
  docker-compose logs | grep "Request completed" | awk '$10 > 5 {print $0}'

  # Get error rate
  docker-compose logs scan-service | awk '/ERROR/ {errors++} /INFO/ {info++} END {print "Error Rate:", errors/(errors+info)*100"%"}'
  ```

---

## Error Handling Strategy

### Error Flow

```
User Request
     │
     ▼
┌─────────────────┐
│   Frontend      │
│  [Try-Catch]    │
└─────────────────┘
     │
     ▼
┌─────────────────┐
│  call_service() │ ◄── HTTP Client with Retry
│  [Retry Logic]  │
└─────────────────┘
     │
     ▼
┌─────────────────┐
│  Backend API    │
│  [Middleware]   │ ◄── Correlation ID
└─────────────────┘
     │
     ▼
┌─────────────────┐
│  Endpoint       │
│  [Try-Catch]    │ ◄── Business Logic
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Exception       │
│ Handler         │ ◄── Standardized Response
└─────────────────┘
     │
     ▼
Structured JSON Response
```

### Error Response Format

- **Success Response**:
  ```json
  {
    "status": "success",
    "data": {
      "batch_id": "abc123",
      "total_urls": 5
    }
  }
  ```

- **Error Response**:
  ```json
  {
    "detail": {
      "error": "batch_not_found",
      "message": "Scan batch abc123 not found",
      "timestamp": "2025-12-18T14:23:45.123456"
    }
  }
  ```

- **Validation Error Response**:
  ```json
  {
    "detail": {
      "error": "validation_error",
      "message": "Request validation failed",
      "errors": [
        {
          "loc": ["body", "domain"],
          "msg": "field required",
          "type": "value_error.missing"
        }
      ],
      "timestamp": "2025-12-18T14:23:45.123456"
    }
  }
  ```

### Common Error Codes

| Error Code       | HTTP Status | Meaning                      | Example                          |
| ---------------- | ----------- | ---------------------------- | -------------------------------- |
| `validation_error` | 422         | Invalid request data         | Missing required field           |
| `batch_not_found`  | 404         | Resource doesn't exist       | Invalid batch ID                 |
| `result_not_found` | 404         | Resource doesn't exist       | Invalid result ID                |
| `network_error`    | 500         | HTTP communication failed    | Service unavailable              |
| `internal_error`   | 500         | Unexpected server error      | Unhandled exception              |
| `scan_failed`      | 500         | Domain scan failed           | Timeout, DNS error               |
| `database_error`   | 500         | Database operation failed    | Connection lost                  |

---

## HTTP Communication

### Retry Strategy

- **Automatic Retries**:
  ```python
  async def call_service(
      method: str,
      url: str,
      max_retries: int = 3,
      timeout: float = 30.0
  ):
      for attempt in range(max_retries):
          try:
              response = await httpx.request(method, url, timeout=timeout)
              response.raise_for_status()
              return response
          except httpx.TimeoutException:
              if attempt < max_retries - 1:
                  await asyncio.sleep(2 ** attempt)  # Exponential backoff
                  continue
              raise
  ```

- **Retry Scenarios**:
  - ✅ **Retries**: Network timeouts, 5xx errors, connection refused
  - ❌ **No Retry**: 4xx errors (except 429), validation errors

- **Timeout Configuration**:
  ```python
  # Short timeout for health checks
  await call_service("GET", "/health", timeout=5.0)

  # Medium timeout for API calls
  await call_service("POST", "/api/scan", timeout=30.0)

  # Long timeout for batch operations
  await call_service("POST", "/api/batch-scan", timeout=300.0)
  ```

### Connection Pooling

`httpx` automatically manages connection pools:

```python
# Reuses connections across requests
client = httpx.AsyncClient()
await client.get("http://api/endpoint1")  # New connection
await client.get("http://api/endpoint2")  # Reuses connection
```

- **Benefits**:
  - Reduced latency (no TCP handshake)
  - Lower CPU usage
  - Better throughput

---

## Operational Guide

### Starting the System

```bash
# Start all services
docker-compose up -d

# Verify all services are running
docker-compose ps

# Check logs for startup errors
docker-compose logs | grep ERROR

# Wait for services to be healthy
docker-compose ps | grep "healthy"
```

### Monitoring Logs

- **Real-time Monitoring**:
  ```bash
  # Terminal 1: Frontend logs
  docker-compose logs -f frontend

  # Terminal 2: Backend logs
  docker-compose logs -f scan-service db-service

  # Terminal 3: Error logs only
  docker-compose logs -f | grep ERROR
  ```

- **Health Checks**:
  ```bash
  # Check all service health
  curl http://localhost:8000/health  # Scan Service
  curl http://localhost:8001/health  # DB Service
  curl http://localhost:9500/health  # Scoring Service

  # Automated health check
  for service in scan-service db-service scoring-service; do
    echo "Checking $service..."
    docker-compose exec $service curl -f http://localhost:8000/health || echo "❌ $service unhealthy"
  done
  ```

### Debugging a Failed Request

1.  **Find the correlation ID**:
    ```bash
    # Search frontend logs for the request
    docker-compose logs frontend | grep "example.com"

    # Example output:
    # [Corr-ID: abc123] User initiated scan for example.com
    ```

2.  **Trace the request**:
    ```bash
    # Search all logs for this correlation ID
    docker-compose logs | grep "abc123"

    # Example output:
    # [Corr-ID: abc123] [FRONTEND] Scan initiated
    # [Corr-ID: abc123] [SCAN-SERVICE] Processing scan
    # [Corr-ID: abc123] [DB-SERVICE] Saving result
    # [Corr-ID: abc123] [SCAN-SERVICE] ERROR: Timeout
    ```

3.  **Analyze the error**:
    ```bash
    # Get detailed error logs
    docker-compose logs scan-service | grep -A 10 "abc123.*ERROR"

    # Check for stack traces
    docker-compose logs scan-service | grep -A 50 "Traceback"
    ```

### Performance Monitoring

- **Request Timing**:
  ```bash
  # Find slow requests (>5 seconds)
  docker-compose logs | grep "Request completed" | awk '$10 > 5 {print $0}'

  # Average request time
  docker-compose logs | grep "Request completed" | awk '{sum+=$10; count++} END {print "Average:", sum/count, "seconds"}'
  ```

- **Error Rate**:
  ```bash
  # Count errors per service
  docker-compose logs --json | jq 'select(.level=="ERROR") | .service' | sort | uniq -c

  # Error rate over time (last hour)
  docker-compose logs --since 1h | grep -c ERROR
  ```

- **Database Performance**:
  ```bash
  # Slow database queries
  docker-compose logs db-service | grep "Query completed" | awk '$10 > 1 {print $0}'

  # Database connection pool status
  docker-compose logs db-service | grep "Connection pool"
  ```

---

## Troubleshooting

### Common Issues

#### Issue 1: Service Won't Start

- **Symptoms**: `ERROR: Service 'scan-service' failed to build`
- **Diagnosis**:
  ```bash
  # Check build logs
  docker-compose build scan-service

  # Check for missing files
  docker-compose run --rm scan-service ls -la /app

  # Verify Python dependencies
  docker-compose run --rm scan-service pip list
  ```
- **Solution**:
  - Ensure all new modules (`logging_config.py`, etc.) are in the Dockerfile `COPY` command.
  - Check for syntax errors in Python files.
  - Verify all dependencies in `requirements.txt`.

---

#### Issue 2: Database Connection Errors

- **Symptoms**:
  - `[DB-SERVICE] ERROR: Connection refused`
  - `[SCAN-SERVICE] ERROR: Database not available`
- **Diagnosis**:
  ```bash
  # Check database service status
  docker-compose ps postgres

  # Check database logs
  docker-compose logs postgres

  # Test database connection
  docker-compose exec scan-service curl -f http://db-service:8001/health
  ```
- **Solution**:
  ```bash
  # Restart database service
  docker-compose restart postgres

  # Verify database initialization
  docker-compose exec postgres psql -U scanuser -d system_scanner_db -c "SELECT 1"

  # Check wait-for-db.sh execution
  docker-compose logs db-service | grep "Postgres is up"
  ```

---

#### Issue 3: Logs Not Appearing

- **Symptoms**:
  ```
  docker-compose logs scan-service
  # No output or minimal output
  ```
- **Diagnosis**:
  ```bash
  # Check if service is running
  docker-compose ps scan-service

  # Check log driver configuration
  docker inspect <container-id> | jq '.[0].HostConfig.LogConfig'

  # Verify log files exist
  docker inspect <container-id> | jq '.[0].LogPath'
  ```
- **Solution**:
  - Ensure services use proper logging.
  - Check Dockerfile for unbuffered output: `ENV PYTHONUNBUFFERED=1`.
  - Restart services to apply new logging: `docker-compose restart`.
  - Check Docker daemon log settings: `sudo systemctl status docker`.

---

#### Issue 4: High Memory Usage

- **Symptoms**:
  - `scan-service` consuming 2GB+ memory
  - Docker host running out of memory
- **Diagnosis**:
  ```bash
  # Check memory usage
  docker stats

  # Check log file sizes
  du -sh /var/lib/docker/containers/*/ 

  # Check for memory leaks
  docker-compose exec scan-service ps aux
  ```
- **Solution**:
  - Restart the service to free memory: `docker-compose restart scan-service`.
  - Check log rotation settings in `docker-compose.yml`:
    ```yaml
    logging:
      options:
        max-size: "10m"
        max-file: "5"
    ```
  - Manually clean old logs: `docker system prune --volumes -f`.

---

#### Issue 5: Correlation ID Not Propagating

- **Symptoms**:
  - `[SCAN-SERVICE]` logs have a correlation ID.
  - `[DB-SERVICE]` logs do not have a correlation ID.
- **Diagnosis**:
  ```bash
  # Check if middleware is applied
  docker-compose logs db-service | grep "correlation_middleware"

  # Verify HTTP headers
  docker-compose exec scan-service curl -v http://db-service:8001/health
  ```
