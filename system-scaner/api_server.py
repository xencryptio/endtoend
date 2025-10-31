from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, HTMLResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import uvicorn
import json
import os
from pathlib import Path
import zipfile
import io
import sqlite3
from contextlib import contextmanager

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
AGENT_TIMEOUT_MINUTES = 1  # Changed from 1 to 5 minutes for more reasonable timeout
AGENT_FOLDERS = {
    "linux": "Linux Agent",
    "windows": "Windows Agent"
}
DB_FILE = "crypto_audit.db"

# Database Context Manager
@contextmanager
def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

# Initialize Database
def init_database():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Agents table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS agents (
                agent_id TEXT PRIMARY KEY,
                hostname TEXT NOT NULL,
                ip_address TEXT NOT NULL,
                os_info TEXT NOT NULL,
                registered_at TEXT NOT NULL,
                last_seen TEXT NOT NULL
            )
        ''')
        
        # Tasks table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tasks (
                task_id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                FOREIGN KEY (agent_id) REFERENCES agents (agent_id)
            )
        ''')
        
        # Results table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS results (
                result_id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                audit_results TEXT NOT NULL,
                received_at TEXT NOT NULL,
                submitted_at TEXT NOT NULL,
                FOREIGN KEY (agent_id) REFERENCES agents (agent_id),
                FOREIGN KEY (task_id) REFERENCES tasks (task_id)
            )
        ''')
        
        conn.commit()
        print("[+] Database initialized successfully")

# Models
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

# Helper Functions
def get_agent_status(agent_id: str) -> str:
    """Determine if agent is active based on last_seen timestamp"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT last_seen FROM agents WHERE agent_id = ?", (agent_id,))
        row = cursor.fetchone()
        
        if not row:
            return "unknown"
        
        try:
            last_seen = datetime.fromisoformat(row["last_seen"])
            current_time = datetime.now()
            time_diff = current_time - last_seen
            
            print(f"[DEBUG] Agent {agent_id}: Last seen={last_seen}, Current={current_time}, Diff={time_diff.total_seconds()}s")
            
            if time_diff > timedelta(minutes=AGENT_TIMEOUT_MINUTES):
                return "inactive"
            return "active"
        except Exception as e:
            print(f"[ERROR] Error calculating status for {agent_id}: {e}")
            return "unknown"

def update_agent_last_seen(agent_id: str):
    """Update the last_seen timestamp for an agent"""
    with get_db() as conn:
        cursor = conn.cursor()
        now = datetime.now().isoformat()
        cursor.execute(
            "UPDATE agents SET last_seen = ? WHERE agent_id = ?",
            (now, agent_id)
        )
        conn.commit()
        print(f"[DEBUG] Updated last_seen for {agent_id} to {now}")

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
        print(f"Error reading folder {folder_name}: {e}")
    
    return files_list

# Endpoints
@app.post("/api/v1/agent/register")
async def register_agent(registration: AgentRegistration):
    """Register a new agent with system information"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO agents 
                (agent_id, hostname, ip_address, os_info, registered_at, last_seen)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                registration.agent_id,
                registration.hostname,
                registration.ip_address,
                registration.os_info,
                registration.timestamp,
                registration.timestamp
            ))
            conn.commit()
        
        print(f"[+] Agent registered: {registration.agent_id} ({registration.hostname})")
        
        return {
            "success": True,
            "message": "Agent registered successfully",
            "agent_id": registration.agent_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/api/v1/system/info")
async def receive_system_info(system_info: SystemInfo):
    """Receive and store system information from agent (heartbeat)"""
    try:
        update_agent_last_seen(system_info.agent_id)
        status = get_agent_status(system_info.agent_id)
        print(f"[+] Heartbeat received from: {system_info.agent_id} ({system_info.hostname}) - Status: {status}")
        
        return {
            "success": True,
            "message": "System information received",
            "agent_id": system_info.agent_id,
            "status": status
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process system info: {str(e)}")

@app.get("/api/v1/agent/fetchaction/{agent_id}")
async def fetch_action(agent_id: str):
    """Agent polls this endpoint to check if a scan is requested"""
    try:
        update_agent_last_seen(agent_id)
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM tasks WHERE agent_id = ? AND status = 'pending' ORDER BY created_at LIMIT 1",
                (agent_id,)
            )
            task = cursor.fetchone()
            
            if task:
                # Mark task as in-progress
                cursor.execute(
                    "UPDATE tasks SET status = 'in_progress', started_at = ? WHERE task_id = ?",
                    (datetime.now().isoformat(), task["task_id"])
                )
                conn.commit()
                
                print(f"[+] Scan task dispatched to agent: {agent_id}")
                
                return FetchActionResponse(
                    scan_flag=True,
                    task_id=task["task_id"],
                    message="Crypto audit scan requested"
                )
        
        return FetchActionResponse(
            scan_flag=False,
            message="No pending tasks"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fetch action failed: {str(e)}")

@app.post("/api/v1/audit/result")
async def receive_audit_result(audit_data: AuditData):
    """Receive cryptographic audit results from agent"""
    try:
        update_agent_last_seen(audit_data.agent_id)
        
        result_id = f"{audit_data.agent_id}_{audit_data.task_id}"
        
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Store audit results
            cursor.execute('''
                INSERT INTO results 
                (result_id, agent_id, task_id, audit_results, received_at, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                result_id,
                audit_data.agent_id,
                audit_data.task_id,
                json.dumps(audit_data.audit_results),
                datetime.now().isoformat(),
                audit_data.timestamp
            ))
            
            # Update task status
            cursor.execute(
                "UPDATE tasks SET status = 'completed', completed_at = ? WHERE task_id = ?",
                (datetime.now().isoformat(), audit_data.task_id)
            )
            
            conn.commit()
        
        print(f"[+] Audit results received from: {audit_data.agent_id} (Task: {audit_data.task_id})")
        print(f"[+] Audit results saved to database with ID: {result_id}")
        
        return {
            "success": True,
            "message": "Audit results received and stored in database",
            "result_id": result_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process audit results: {str(e)}")

@app.post("/api/v1/admin/trigger-scan/{agent_id}")
async def trigger_scan(agent_id: str):
    """Admin endpoint to trigger a scan for a specific agent"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT agent_id FROM agents WHERE agent_id = ?", (agent_id,))
            
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Agent not found")
            
            status = get_agent_status(agent_id)
            if status == "inactive":
                print(f"[!] Warning: Triggering scan for inactive agent: {agent_id}")
            
            task_id = f"task_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
            
            cursor.execute('''
                INSERT INTO tasks (task_id, agent_id, status, created_at)
                VALUES (?, ?, ?, ?)
            ''', (task_id, agent_id, "pending", datetime.now().isoformat()))
            
            conn.commit()
        
        print(f"[+] Scan triggered for agent: {agent_id} (Task ID: {task_id})")
        
        return {
            "success": True,
            "message": "Scan triggered successfully",
            "task_id": task_id,
            "agent_id": agent_id,
            "agent_status": status
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger scan: {str(e)}")

@app.get("/api/v1/admin/agents")
async def list_agents():
    """List all registered agents with current status"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM agents ORDER BY last_seen DESC")
        agents = cursor.fetchall()
        
        agents_with_status = []
        for agent in agents:
            agent_dict = dict(agent)
            agent_dict["status"] = get_agent_status(agent["agent_id"])
            
            try:
                last_seen = datetime.fromisoformat(agent["last_seen"])
                current_time = datetime.now()
                time_diff = current_time - last_seen
                agent_dict["minutes_since_last_seen"] = int(time_diff.total_seconds() / 60)
            except Exception as e:
                print(f"[ERROR] Error calculating time diff for {agent['agent_id']}: {e}")
                agent_dict["minutes_since_last_seen"] = 999999
            
            agents_with_status.append(agent_dict)
        
        active_count = sum(1 for a in agents_with_status if a["status"] == "active")
        inactive_count = len(agents_with_status) - active_count
        
        return {
            "success": True,
            "count": len(agents_with_status),
            "active_count": active_count,
            "inactive_count": inactive_count,
            "timeout_minutes": AGENT_TIMEOUT_MINUTES,
            "server_time": datetime.now().isoformat(),
            "agents": agents_with_status
        }

@app.get("/api/v1/admin/agent/{agent_id}/results")
async def get_agent_results(agent_id: str):
    """Get all results for a specific agent"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM results WHERE agent_id = ? ORDER BY received_at DESC",
            (agent_id,)
        )
        results = cursor.fetchall()
        
        results_list = []
        for result in results:
            result_dict = dict(result)
            result_dict["audit_results"] = json.loads(result_dict["audit_results"])
            results_list.append(result_dict)
        
        return {
            "success": True,
            "agent_id": agent_id,
            "count": len(results_list),
            "results": results_list
        }

@app.get("/api/v1/admin/tasks")
async def list_tasks():
    """List all scan tasks"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tasks ORDER BY created_at DESC")
        tasks = cursor.fetchall()
        
        return {
            "success": True,
            "count": len(tasks),
            "tasks": [dict(task) for task in tasks]
        }

@app.get("/api/v1/admin/results")
async def list_results():
    """List all audit results"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT result_id, agent_id, task_id, received_at FROM results ORDER BY received_at DESC")
        results = cursor.fetchall()
        
        return {
            "success": True,
            "count": len(results),
            "results": [dict(result) for result in results]
        }

@app.get("/api/v1/admin/results/{result_id}")
async def get_result_detail(result_id: str):
    """Get detailed audit results by result_id"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM results WHERE result_id = ?", (result_id,))
        result = cursor.fetchone()
        
        if result:
            result_dict = dict(result)
            result_dict["audit_results"] = json.loads(result_dict["audit_results"])
            return {
                "success": True,
                "result": result_dict
            }
        else:
            raise HTTPException(status_code=404, detail="Result not found")

@app.get("/api/v1/admin/stats")
async def get_stats():
    """Get overall statistics"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM agents")
        agents = cursor.fetchall()
        active_agents = sum(1 for a in agents if get_agent_status(a["agent_id"]) == "active")
        
        cursor.execute("SELECT COUNT(*) as count, status FROM tasks GROUP BY status")
        task_stats = {row["status"]: row["count"] for row in cursor.fetchall()}
        
        cursor.execute("SELECT COUNT(*) as count FROM results")
        result_count = cursor.fetchone()["count"]
        
        return {
            "success": True,
            "timestamp": datetime.now().isoformat(),
            "agents": {
                "total": len(agents),
                "active": active_agents,
                "inactive": len(agents) - active_agents
            },
            "tasks": {
                "total": sum(task_stats.values()),
                "pending": task_stats.get("pending", 0),
                "in_progress": task_stats.get("in_progress", 0),
                "completed": task_stats.get("completed", 0)
            },
            "results": {
                "total": result_count
            }
        }

@app.get("/api/v1/files/list/{folder_type}")
async def list_files(folder_type: str):
    """List files in Linux Agent or Windows Agent folder"""
    try:
        if folder_type not in AGENT_FOLDERS:
            raise HTTPException(status_code=400, detail="Invalid folder type")
        
        folder_name = AGENT_FOLDERS[folder_type]
        files = get_folder_files(folder_name)
        
        return {
            "success": True,
            "folder": folder_name,
            "folder_type": folder_type,
            "count": len(files),
            "files": files
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list files: {str(e)}")

@app.get("/api/v1/files/download/{folder_type}/{filename}")
async def download_file(folder_type: str, filename: str):
    """Download a specific file from agent folder"""
    try:
        if folder_type not in AGENT_FOLDERS:
            raise HTTPException(status_code=400, detail="Invalid folder type")
        
        folder_name = AGENT_FOLDERS[folder_type]
        file_path = Path(folder_name) / filename
        
        if not file_path.resolve().is_relative_to(Path(folder_name).resolve()):
            raise HTTPException(status_code=403, detail="Access denied")
        
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        
        print(f"[+] File download: {file_path}")
        
        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type='application/octet-stream'
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download file: {str(e)}")

@app.get("/api/v1/files/download-zip/{folder_type}")
async def download_folder_as_zip(folder_type: str):
    """Download all files from a folder as a ZIP archive"""
    try:
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
        
        print(f"[+] ZIP download: {folder_name} ({file_count} files)")
        
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={zip_filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create ZIP: {str(e)}")

if __name__ == "__main__":
    print("=" * 60)
    print("Starting Crypto Audit API Server v3.1 (SQLite)")
    print("=" * 60)
    print(f"Database: {DB_FILE}")
    print(f"Agent Timeout: {AGENT_TIMEOUT_MINUTES} minutes")
    print(f"Agent Folders: {AGENT_FOLDERS}")
    print("=" * 60)
    
    init_database()
    
    uvicorn.run(app, host="0.0.0.0", port=9000)
