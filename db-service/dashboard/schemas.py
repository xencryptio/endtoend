from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field

class DashboardApplication(BaseModel):
    Organisation: str = Field(..., alias="Organisation")
    Org_ID: str = Field(..., alias="Org ID")
    Sub_Org: str = Field(..., alias="Sub Org")
    Sub_Org_ID: str = Field(..., alias="Sub Org ID")
    Org_Target_Migration_Data: str = Field("Q4 2026", alias="Org Target Migration Data")
    application: str
    Application_ID: str = Field(..., alias="Application ID")
    pqc_ready: float
    risk_level: str
    status: str
    alg_changes: int
    cert_changes: int
    total_algorithms: int
    total_certificates: int
    total_pqc_vulnerable_algorithms: int
    total_pqc_vulnerable_certificates: int
    vulnerabilities: int
    time_complexity: str
    current_date: str
    App_Category: str = Field(..., alias="App Category")
    algorithms_used: List[str]
