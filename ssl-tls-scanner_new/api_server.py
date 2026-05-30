from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sslscanner.orchestrator import run

app = FastAPI(title="SSL/TLS Scanner API", version="1.0.0")


class ScanRequest(BaseModel):
    host: str = Field(..., description="Hostname or domain to scan")
    port: int = Field(443, ge=1, le=65535)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/scan")
async def scan_endpoint(request: ScanRequest):
    try:
        raw_host = request.host.strip()
        for prefix in ("https://", "http://"):
            if raw_host.lower().startswith(prefix):
                raw_host = raw_host[len(prefix):]
                break
        host = raw_host.split("/")[0]
        report = run(host, request.port, output_file=None, write_output=False)
        return report
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
