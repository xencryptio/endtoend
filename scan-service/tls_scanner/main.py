from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl
import uvicorn
from scanner import scan_domain

app = FastAPI(title="TLS Cryptographic Scanner", version="1.0.0")

class ScanRequest(BaseModel):
    url: HttpUrl

class ScanResponse(BaseModel):
    domain: str
    endpoints: list

@app.post("/scan", response_model=ScanResponse)
async def scan_endpoint(request: ScanRequest):
    """
    Scan a URL's TLS configuration and extract cryptographic parameters.
    Returns raw cryptographic facts without vulnerability assessment.
    """
    try:
        result = await scan_domain(str(request.url))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
