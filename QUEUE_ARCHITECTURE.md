# Database Queue-Based Scan Architecture

## Overview
The system has been refactored to use a **database-centric queue architecture** where:
- **Database is the single source of truth** for all scan state
- **Frontend polls database** for status updates (replaces SSE)
- **Scan requests are queued** in the database for async processing
- **No more state sync issues** between frontend and backend

## Architecture Flow

### 1. User Submits Scan
```
User → Frontend Form
  ↓
POST /create-scan-request
  ↓
Scan Service → Create batch in DB (status: pending)
  ↓
Returns batch_id to frontend
```

### 2. Frontend Polls for Updates
```
Frontend receives batch_id
  ↓
START polling GET /batch/{batch_id} every 1 second
  ↓
Scan Service picks up pending batch (or scheduled to do so)
  ↓
Scan Service updates status: pending → processing → completed
  ↓
Frontend receives status updates and displays them
  ↓
When status = completed, stop polling and load results
```

### 3. Results are Retrieved from Database
```
Scan Service stores results in DB
  ↓
Frontend loads results from GET /results/batch/{batch_id}
  ↓
Results displayed in ResultsDetailPage
```

## Key Changes

### Backend (Scan Service)

**New Endpoints:**
- `POST /create-scan-request` - Queue a scan request
  - Accepts: domain, max_concurrent, save_to_db
  - Returns: batch_id, status=pending
  - Does NOT start scanning immediately

- `GET /batch/{batch_id}` - Check batch status and stats
  - Returns: batch status, successful_count, failed_count, execution_time_seconds

- `POST /process-pending-scans` - Process queued scans (called periodically)
  - Picks up batches with status=pending
  - Updates status to processing
  - Actually performs the scan

**Modified Endpoints:**
- `GET /scans/batch` - Now accepts optional `status` query parameter
  - Example: `/scans/batch?status=pending` to get pending scans

### Database Changes

**New Status Field Values:**
- `pending` - Scan created but not started
- `processing` - Scan currently running
- `completed` - Scan finished successfully
- `failed` - Scan encountered an error

**Updated ScanBatch Model:**
- `status` field now used as primary state indicator
- `created_at`, `updated_at` timestamps for tracking

### Frontend Changes

**Old Approach (Removed):**
- ❌ SSE (Server-Sent Events) for real-time progress
- ❌ Local state updates during scan
- ❌ Auto-reload from database after scan completion
- ❌ connectSSEWithPost function

**New Approach:**
- ✅ Queue-based scan submission (create request in DB)
- ✅ Polling-based status updates (every 1 second)
- ✅ Database as single source of truth
- ✅ Clean separation of concerns

**New Functions:**
```typescript
handleQueuedScan() - Submit scan and start polling
  └─ POST /create-scan-request
  └─ pollBatchStatus() - Poll every 1 second until complete
     └─ GET /batch/{batch_id}
     └─ Updates UI with each status change
     └─ When status=completed, stops polling
     └─ Automatically loads results
```

## State Management Flow

### Before (SSE-based)
```
Frontend State ─────→ SSE Stream ─────→ Frontend State
     ↓
   Database
(eventual consistency, sync issues)
```

### After (Queue-based)
```
Frontend Form
     ↓
Create Request (DB) ← Always the source of truth → Poll for Updates (UI)
     ↓
Scan Service polls DB
```

## Benefits

1. **No Sync Issues** - Database is always the single source of truth
2. **Resilient** - If connection drops, can resume by polling batch ID
3. **Async-Friendly** - Scans can be processed by any worker in a distributed system
4. **Scalable** - Multiple workers can pick up pending scans
5. **Simple** - No WebSocket/SSE complexity
6. **Persistent** - All state stored in database from day one

## Testing the New Flow

### Manual Testing

1. **Start the services:**
   ```bash
   # In separate terminals
   python -m db_service   # Port 8001
   python -m scan_service # Port 8000
   npm run dev            # Port 3000
   ```

2. **Submit a scan:**
   - Open http://localhost:3000
   - Navigate to Web Scan
   - Enter a domain (e.g., google.com)
   - Click "Scan"
   - Watch the console and UI for status updates

3. **Verify database updates:**
   - Check `scan_batches` table:
     - Status should go: pending → processing → completed
   - Check `scan_results` table:
     - Results should be populated as scan progresses

4. **Test persistence:**
   - Submit a scan
   - Refresh the page
   - History should still show the scan (loaded from DB)
   - Status should reflect current state in database

### API Testing

```bash
# Create a scan request
curl -X POST http://localhost:8000/create-scan-request \
  -H "Content-Type: application/json" \
  -d '{"domain": "google.com", "max_concurrent": 5, "save_to_db": true}'

# Response:
# {
#   "batch_id": "batch_1234567890_5678",
#   "status": "pending",
#   "total_domains": 1,
#   "message": "Scan request queued..."
# }

# Check status (poll this every 1 second)
curl http://localhost:8000/batch/batch_1234567890_5678

# Response (before scan starts):
# {
#   "batch_id": "batch_1234567890_5678",
#   "status": "pending",
#   "successful_count": 0,
#   "failed_count": 0,
#   "total_urls": 1,
#   "created_at": "2025-12-31T10:00:00Z"
# }

# Response (while scanning):
# {
#   "batch_id": "batch_1234567890_5678",
#   "status": "processing",
#   "successful_count": 0,
#   "failed_count": 0,
#   ...
# }

# Response (after scan completes):
# {
#   "batch_id": "batch_1234567890_5678",
#   "status": "completed",
#   "successful_count": 1,
#   "failed_count": 0,
#   "execution_time_seconds": 45.3,
#   ...
# }
```

## Next Steps for Full Implementation

### Backend (Scan Service)
- [ ] Implement actual `/process-pending-scans` logic
  - Query for pending batches
  - Pick one up
  - Update status to "processing"
  - Run the scan_domain logic from existing endpoint
  - Save results to DB
  - Update status to "completed"
  
- [ ] Add scheduler/worker
  - Option 1: APScheduler - periodic task every 5 seconds
  - Option 2: Celery - distributed task queue
  - Option 3: Simple background thread

- [ ] Add error handling
  - If scan fails, mark batch as "failed"
  - Store error message

### Frontend
- [ ] Enhance polling UI
  - Show progress percentage
  - Show current domain being scanned
  - Show estimated time remaining

- [ ] Add cancel functionality
  - PUT /batch/{batch_id} with status=cancelled

- [ ] Add retry logic
  - If scan is stuck in "processing" for too long, mark as failed

### Database
- [ ] Add monitoring/admin views
  - Stuck batches (processing > 10 minutes)
  - Queue depth (how many pending)

## Migration from Old System

The old `connectSSEWithPost` function is still available but should be considered **deprecated**:
- Old function handles scan/progress/complete all in one stream
- New system separates concerns: queue, process, poll

**If you need to keep old SSE-based scanning temporarily:**
- It's still implemented but routes through the new DB
- Just call handleScanSubmit with SSE approach separately

## Troubleshooting

### Scans stuck in "pending"
- Check if scan service is running
- Check if `/process-pending-scans` is being called
- Check database for pending batches

### Status not updating in UI
- Check browser console for polling errors
- Verify GET /batch/{batch_id} returns correct status
- Check network tab to see polling requests

### Results not showing after completion
- Verify status is "completed" in database
- Check if results were saved to scan_results table
- Try clicking "View Results" button

