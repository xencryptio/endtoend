from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import uvicorn
import json
import os
from pathlib import Path
import zipfile
import io
from contextlib import contextmanager
from sqlalchemy import create_engine, Column, String, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import sessionmaker, relationship, Session, declarative_base
from sqlalchemy.exc import SQLAlchemyError
import logging

# Configure logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Crypto Audit API Server")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Configuration
AGENT_TIMEOUT_MINUTES = 5
AGENT_FOLDERS = {
    "linux": "Linux Agent",
    "windows": "Windows Agent"
}
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://scanuser:scanpass@localhost:5432/system_scanner_db")

# --- SQLAlchemy Setup ---
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- SQLAlchemy Models ---
class Agent(Base):
    __tablename__ = "agents"
    agent_id = Column(String, primary_key=True, index=True)
    hostname = Column(String, nullable=False)
    ip_address = Column(String, nullable=False)
    os_info = Column(String, nullable=False)
    registered_at = Column(DateTime, nullable=False)
    last_seen = Column(DateTime, nullable=False)
    tasks = relationship("Task", back_populates="agent", cascade="all, delete-orphan")
    results = relationship("Result", back_populates="agent", cascade="all, delete-orphan")

class Task(Base):
    __tablename__ = "tasks"
    task_id = Column(String, primary_key=True, index=True)
    agent_id = Column(String, ForeignKey("agents.agent_id"), nullable=False)
    status = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    agent = relationship("Agent", back_populates="tasks")
    result = relationship("Result", back_populates="task", uselist=False, cascade="all, delete-orphan")

class Result(Base):
    __tablename__ = "results"
    result_id = Column(String, primary_key=True, index=True)
    agent_id = Column(String, ForeignKey("agents.agent_id"), nullable=False)
    task_id = Column(String, ForeignKey("tasks.task_id"), nullable=False, unique=True)
    audit_results = Column(Text, nullable=False)
    received_at = Column(DateTime, nullable=False)
    submitted_at = Column(DateTime, nullable=False)
    agent = relationship("Agent", back_populates="results")
    task = relationship("Task", back_populates="result")

# Create tables
Base.metadata.create_all(bind=engine)# Pydantic Models
class AgentRegistration(BaseModel):
    agent_id: str
    hostname: str
    ip_address: str
    os_info: str
    timestamp: str

class SystemInfo(BaseModel):
    agent_id: str
    hostname: str
    ip_address: str
    os_info: str
    kernel_version: str
    timestamp: str

class FetchActionResponse(BaseModel):
    scan_flag: bool
    task_id: Optional[str] = None
    message: str

class AuditData(BaseModel):
    agent_id: str
    task_id: str
    audit_results: Dict[str, Any]
    timestamp: str

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Helper Functions
def get_agent_status(agent: Agent) -> str:
    """Determine if agent is active based on last_seen timestamp"""
    if not agent or not agent.last_seen:
        return "unknown"
    
    try:
        time_diff = datetime.now() - agent.last_seen
        if time_diff > timedelta(minutes=AGENT_TIMEOUT_MINUTES):
            return "inactive"
        return "active"
    except Exception as e:
        logger.error(f"Error calculating status for {agent.agent_id}: {e}")
        return "unknown"

def update_agent_last_seen(db: Session, agent_id: str):
    """Update the last_seen timestamp for an agent"""
    agent = db.query(Agent).filter(Agent.agent_id == agent_id).first()
    if agent:
        agent.last_seen = datetime.now()
        db.commit()
        logger.debug(f"Updated last_seen for {agent_id}")

def get_folder_files(folder_name: str):
    """Get list of files in a folder with their sizes"""
    files_list = []
    folder_path = Path(folder_name)
    if not folder_path.exists() or not folder_path.is_dir():
        return files_list
    try:
        for file_path in folder_path.iterdir():
            if file_path.is_file():
                file_stat = file_path.stat()
                files_list.append({
                    "name": file_path.name,
                    "size": file_stat.st_size,
                    "modified": datetime.fromtimestamp(file_stat.st_mtime).isoformat()
                })
    except Exception as e:
        logger.error(f"Error reading folder {folder_name}: {e}")
    return files_list

# Endpoints
@app.post("/api/v1/agent/register")
async def register_agent(registration: AgentRegistration, db: Session = Depends(get_db)):
    """Register a new agent with system information"""
    try:
        agent = db.query(Agent).filter(Agent.agent_id == registration.agent_id).first()
        timestamp = datetime.fromisoformat(registration.timestamp)
        if agent:
            agent.hostname = registration.hostname
            agent.ip_address = registration.ip_address
            agent.os_info = registration.os_info
            agent.last_seen = timestamp
        else:
            agent = Agent(
                agent_id=registration.agent_id,
                hostname=registration.hostname,
                ip_address=registration.ip_address,
                os_info=registration.os_info,
                registered_at=timestamp,
                last_seen=timestamp
            )
            db.add(agent)
        db.commit()
        logger.info(f"Agent registered: {registration.agent_id} ({registration.hostname})")
        return {"success": True, "message": "Agent registered successfully", "agent_id": registration.agent_id}
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/api/v1/system/info")
async def receive_system_info(system_info: SystemInfo, db: Session = Depends(get_db)):
    """Receive and store system information from agent (heartbeat)"""
    try:
        update_agent_last_seen(db, system_info.agent_id)
        agent = db.query(Agent).filter(Agent.agent_id == system_info.agent_id).first()
        status = get_agent_status(agent)
        logger.info(f"Heartbeat received from: {system_info.agent_id} ({system_info.hostname}) - Status: {status}")
        return {"success": True, "message": "System information received", "agent_id": system_info.agent_id, "status": status}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Failed to process system info: {str(e)}")

@app.get("/api/v1/agent/fetchaction/{agent_id}")
async def fetch_action(agent_id: str, db: Session = Depends(get_db)):
    """Agent polls this endpoint to check if a scan is requested"""
    try:
        update_agent_last_seen(db, agent_id)
        task = db.query(Task).filter(Task.agent_id == agent_id, Task.status == 'pending').order_by(Task.created_at).first()
        if task:
            task.status = 'in_progress'
            task.started_at = datetime.now()
            db.commit()
            logger.info(f"Scan task dispatched to agent: {agent_id}")
            return FetchActionResponse(scan_flag=True, task_id=task.task_id, message="Crypto audit scan requested")
        return FetchActionResponse(scan_flag=False, message="No pending tasks")
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Fetch action failed: {str(e)}")

@app.post("/api/v1/audit/result")
async def receive_audit_result(audit_data: AuditData, db: Session = Depends(get_db)):
    """Receive cryptographic audit results from agent"""
    try:
        update_agent_last_seen(db, audit_data.agent_id)
        result_id = f"{audit_data.agent_id}_{audit_data.task_id}"
        
        new_result = Result(
            result_id=result_id,
            agent_id=audit_data.agent_id,
            task_id=audit_data.task_id,
            audit_results=json.dumps(audit_data.audit_results),
            received_at=datetime.now(),
            submitted_at=datetime.fromisoformat(audit_data.timestamp)
        )
        db.add(new_result)
        
        task = db.query(Task).filter(Task.task_id == audit_data.task_id).first()
        if task:
            task.status = 'completed'
            task.completed_at = datetime.now()
        
        db.commit()
        logger.info(f"Audit results received from: {audit_data.agent_id} (Task: {audit_data.task_id})")
        return {"success": True, "message": "Audit results received and stored", "result_id": result_id}
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to process audit results: {str(e)}")

@app.post("/api/v1/admin/trigger-scan/{agent_id}")
async def trigger_scan(agent_id: str, db: Session = Depends(get_db)):
    """Admin endpoint to trigger a scan for a specific agent"""
    try:
        agent = db.query(Agent).filter(Agent.agent_id == agent_id).first()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        status = get_agent_status(agent)
        if status == "inactive":
            logger.warning(f"Triggering scan for inactive agent: {agent_id}")
        
        task_id = f"task_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        new_task = Task(task_id=task_id, agent_id=agent_id, status="pending", created_at=datetime.now())
        db.add(new_task)
        db.commit()
        
        logger.info(f"Scan triggered for agent: {agent_id} (Task ID: {task_id})")
        return {"success": True, "message": "Scan triggered successfully", "task_id": task_id, "agent_id": agent_id, "agent_status": status}
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to trigger scan: {str(e)}")

@app.get("/api/v1/admin/agents")
async def list_agents(db: Session = Depends(get_db)):
    """List all registered agents with current status"""
    agents = db.query(Agent).order_by(Agent.last_seen.desc()).all()
    agents_with_status = []
    for agent in agents:
        agent_dict = {c.name: getattr(agent, c.name) for c in agent.__table__.columns}
        agent_dict["status"] = get_agent_status(agent)
        try:
            time_diff = datetime.now() - agent.last_seen
            agent_dict["minutes_since_last_seen"] = int(time_diff.total_seconds() / 60)
        except:
            agent_dict["minutes_since_last_seen"] = 999999
        agents_with_status.append(agent_dict)
    
    active_count = sum(1 for a in agents_with_status if a["status"] == "active")
    return {
        "success": True, "count": len(agents_with_status), "active_count": active_count,
        "inactive_count": len(agents_with_status) - active_count,
        "timeout_minutes": AGENT_TIMEOUT_MINUTES, "server_time": datetime.now().isoformat(),
        "agents": agents_with_status
    }

@app.get("/api/v1/admin/agent/{agent_id}/results")
async def get_agent_results(agent_id: str, db: Session = Depends(get_db)):
    """Get all results for a specific agent"""
    results = db.query(Result).filter(Result.agent_id == agent_id).order_by(Result.received_at.desc()).all()
    results_list = []
    for result in results:
        result_dict = {c.name: getattr(result, c.name) for c in result.__table__.columns}
        result_dict["audit_results"] = json.loads(result_dict["audit_results"])
        results_list.append(result_dict)
    return {"success": True, "agent_id": agent_id, "count": len(results_list), "results": results_list}

@app.get("/api/v1/admin/tasks")
async def list_tasks(db: Session = Depends(get_db)):
    """List all scan tasks"""
    tasks = db.query(Task).order_by(Task.created_at.desc()).all()
    return {"success": True, "count": len(tasks), "tasks": [dict(row.__dict__) for row in tasks]}

@app.get("/api/v1/admin/results/{result_id}")
async def get_result_detail(result_id: str, db: Session = Depends(get_db)):
    """Get detailed audit results by result_id"""
    result = db.query(Result).filter(Result.result_id == result_id).first()
    if result:
        result_dict = {c.name: getattr(result, c.name) for c in result.__table__.columns}
        result_dict["audit_results"] = json.loads(result_dict["audit_results"])
        return {"success": True, "result": result_dict}
    raise HTTPException(status_code=404, detail="Result not found")

@app.get("/api/v1/admin/stats")
async def get_stats(db: Session = Depends(get_db)):
    """Get overall statistics"""
    total_agents = db.query(func.count(Agent.agent_id)).scalar()
    active_agents = db.query(func.count(Agent.agent_id)).filter(Agent.last_seen > datetime.now() - timedelta(minutes=AGENT_TIMEOUT_MINUTES)).scalar()
    task_stats = db.query(Task.status, func.count(Task.status)).group_by(Task.status).all()
    result_count = db.query(func.count(Result.result_id)).scalar()
    
    return {
        "success": True, "timestamp": datetime.now().isoformat(),
        "agents": {"total": total_agents, "active": active_agents, "inactive": total_agents - active_agents},
        "tasks": {"total": sum(c for s, c in task_stats), **{s: c for s, c in task_stats}},
        "results": {"total": result_count}
    }

@app.get("/api/v1/files/list/{folder_type}")
async def list_files(folder_type: str):
    """List files in Linux Agent or Windows Agent folder"""
    if folder_type not in AGENT_FOLDERS:
        raise HTTPException(status_code=400, detail="Invalid folder type")
    folder_name = AGENT_FOLDERS[folder_type]
    files = get_folder_files(folder_name)
    return {"success": True, "folder": folder_name, "folder_type": folder_type, "count": len(files), "files": files}

@app.get("/api/v1/files/download/{folder_type}/{filename}")
async def download_file(folder_type: str, filename: str):
    """Download a specific file from agent folder"""
    if folder_type not in AGENT_FOLDERS:
        raise HTTPException(status_code=400, detail="Invalid folder type")
    folder_name = AGENT_FOLDERS[folder_type]
    file_path = Path(folder_name) / filename
    if not file_path.resolve().is_relative_to(Path(folder_name).resolve()):
        raise HTTPException(status_code=403, detail="Access denied")
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=str(file_path), filename=filename, media_type='application/octet-stream')

@app.get("/api/v1/files/download-zip/{folder_type}")
async def download_folder_as_zip(folder_type: str):
    """Download all files from a folder as a ZIP archive"""
    if folder_type not in AGENT_FOLDERS:
        raise HTTPException(status_code=400, detail="Invalid folder type")
    folder_name = AGENT_FOLDERS[folder_type]
    folder_path = Path(folder_name)
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        file_count = 0
        for file_path in folder_path.iterdir():
            if file_path.is_file():
                zip_file.write(file_path, arcname=file_path.name)
                file_count += 1
        if file_count == 0:
            raise HTTPException(status_code=404, detail="No files found in folder")
    
    zip_buffer.seek(0)
    zip_filename = f"{folder_name.replace(' ', '_')}.zip"
    return StreamingResponse(zip_buffer, media_type="application/zip", headers={"Content-Disposition": f"attachment; filename={zip_filename}"})

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Starting Crypto Audit API Server v3.2 (PostgreSQL)")
    logger.info("=" * 60)
    logger.info(f"Database URL: {DATABASE_URL}")
    logger.info(f"Agent Timeout: {AGENT_TIMEOUT_MINUTES} minutes")
    logger.info(f"Agent Folders: {AGENT_FOLDERS}")
    logger.info("=" * 60)
    
    uvicorn.run(app, host="0.0.0.0", port=9000)
