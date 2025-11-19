# Microservices Security Scanner Architecture

## Quick Start Commands

### Local Development

```bash
# Build all containers
docker compose build

# Start all services
docker compose up

# Start in detached mode (background)
docker compose up -d

# Rebuild images and restart services (USE THIS AFTER CODE CHANGES)
docker compose up -d --build

# View logs
docker compose logs -f

# View logs for a specific service
docker compose logs -f repo-scanner

# Stop all services
docker compose down

# Stop and remove volumes (fresh start - DELETES ALL DATA)
docker compose down -v

# See which containers are running
docker compose ps
```

### Cloud Platform Deployment

```bash
# Make auto-config script executable
chmod +x auto-config.sh

# Run configuration script (sets up environment)
sudo ./auto-config.sh

# Build containers
docker compose build

# Start services
docker compose up

# Or start in detached mode
docker compose up -d
```

### Accessing Services

| Service | URL | Purpose |
|---------|-----|---------|
| **Frontend** | http://localhost:3000 | Main application UI |
| **Adminer** | http://localhost:8080 | Database management GUI |
| **DB Service API** | http://localhost:8002 | Database API endpoints |
| **Repo Scanner API** | http://localhost:8003 | Repository scanning API |
| **Crypto Scanner API** | http://localhost:8001 | TLS/SSL scanning API |
| **System Scanner API** | http://localhost:9000 | System vulnerability API |

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture Components](#architecture-components)
4. [Service Details](#service-details)
5. [Understanding Docker Environment](#understanding-docker-environment)
6. [Container Networking](#container-networking)
7. [Database Migration Strategy](#database-migration-strategy)
8. [Database Migration Workflow](#database-migration-workflow)
9. [Development Workflow](#development-workflow)
10. [Debugging and Troubleshooting](#debugging-and-troubleshooting)
11. [Data Model Considerations](#data-model-considerations)

---

## System Overview

This is a **microservices-based security scanning platform** that performs various security assessments including repository scanning, TLS/SSL analysis, and system vulnerability detection. The architecture follows modern cloud-native principles with containerization and service isolation.

### Core Architecture Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Browser                           │
│              ┌─────────────────────┐                        │
│              │  React Frontend UI  │                        │
│              └──────────┬──────────┘                        │
└─────────────────────────┼────────────────────────────────────┘
                          │ HTTP/REST API
┌─────────────────────────┼────────────────────────────────────┐
│              Docker Environment                              │
│                         │                                    │
│    ┌────────────────────┼─────────────────────────┐         │
│    │     Service Layer                            │         │
│    │                    ▼                         │         │
│    │  ┌──────────────────────────────────────┐   │         │
│    │  │   API Gateway / Load Balancer        │   │         │
│    │  └────┬─────────┬──────────┬────────────┘   │         │
│    │       │         │          │                 │         │
│    │       ▼         ▼          ▼                 │         │
│    │  ┌─────────┐ ┌──────┐ ┌──────────┐          │         │
│    │  │Repo     │ │DB    │ │System    │          │         │
│    │  │Scanner  │ │Service│ │Scanner   │          │         │
│    │  │:8003    │ │:8002 │ │:9000     │          │         │
│    │  └────┬────┘ └───┬──┘ └────┬─────┘          │         │
│    │       │          │         │                 │         │
│    │       │    ┌─────┴────┐    │                 │         │
│    │       │    │ Crypto   │    │                 │         │
│    │       │    │ Scanner  │    │                 │         │
│    │       │    │ :8001    │    │                 │         │
│    │       │    └─────┬────┘    │                 │         │
│    └───────┼──────────┼─────────┼─────────────────┘         │
│            │          │         │                           │
│            ▼          ▼         ▼                           │
│    ┌──────────────────────────────────┐                    │
│    │   PostgreSQL Database :5432      │                    │
│    │  ┌────────────────────────────┐  │                    │
│    │  │ • repo_scanner_db          │  │                    │
│    │  │ • scan_results_db          │  │                    │
│    │  │ • system_scanner_db        │  │                    │
│    │  └────────────────────────────┘  │                    │
│    └──────────────────────────────────┘                    │
│                                                             │
│    External Agents (Linux/Windows) ──────► System Scanner  │
└─────────────────────────────────────────────────────────────┘
```

### Architecture Characteristics

- **Pattern**: Microservices Architecture
- **Orchestration**: Docker Compose
- **Data Strategy**: Single PostgreSQL database with multiple schemas
- **Communication**: RESTful HTTP APIs
- **Isolation**: Container-based service isolation

---

## Technology Stack

### Frontend Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Framework** | React | UI component library |
| **Language** | TypeScript | Type-safe JavaScript |
| **Build Tool** | Vite | Fast development server and bundler |
| **Styling** | Tailwind CSS | Utility-first CSS framework |
| **UI Components** | shadcn/ui + Radix UI | Pre-built accessible components |
| **State Management** | TanStack Query (React Query) | Server state synchronization |
| **Routing** | React Router | Client-side routing |

### Backend Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Framework** | FastAPI | High-performance Python web framework |
| **Language** | Python | Primary backend language |
| **ORM** | SQLAlchemy | Database abstraction layer |
| **Migrations** | Alembic | Database schema version control |
| **Database** | PostgreSQL | Relational database |
| **Containerization** | Docker | Service isolation and deployment |

---

## Architecture Components

### 1. Frontend Service (`frontend/`)

**Purpose**: Provides the user interface for interacting with all backend services.

**Configuration**:
- Internal Port: 3000
- External Port: 3000
- Access URL: `http://localhost:3000`

**Dependencies**:
- Calls `db-service` on port 8002
- Calls `repo-scanner` on port 8003
- Calls `system-scanner` on port 9000

**Key Features**:
- Real-time scan status updates
- Dashboard for viewing scan results
- Interactive repository and system configuration

---

### 2. PostgreSQL Database (`postgres`)

**Purpose**: Centralized data persistence layer for all services.

**Configuration**:
- Internal Port: 5432
- External Port: 5432
- Connection String Format: `postgresql://scanuser:scanpass@postgres:5432/{database_name}`

**Database Schemas**:

```
PostgreSQL Instance (:5432)
├── repo_scanner_db
│   └── Tables for repository scan results
├── scan_results_db
│   └── Tables for TLS/SSL scan results
└── system_scanner_db
    └── Tables for system vulnerability data
```

**Accessed By**:
- `repo-scanner` → `repo_scanner_db`
- `db-service` → `scan_results_db`
- `system-scanner` → `system_scanner_db`

---

## Service Details

### Service 1: DB Service (`db-service`)

**Purpose**: Central API gateway for database operations, primarily for crypto/TLS scanning results.

**Technical Specifications**:
```
Framework:     FastAPI
Language:      Python
ORM:           SQLAlchemy
Migrations:    Alembic
Internal Port: 8002
External Port: 8002
Database:      scan_results_db
```

**API Responsibilities**:
- CRUD operations for scan results
- Data aggregation and reporting
- Query interface for frontend

**Communication Pattern**:
```
Frontend ──HTTP─► DB Service ──SQLAlchemy─► PostgreSQL
                      ▲
                      │
                  HTTP │
                      │
              Crypto Scanner
```

**Container Startup Sequence**:
```bash
alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8002
```

---

### Service 2: Repo Scanner (`repo-scanner`)

**Purpose**: Scans code repositories for security vulnerabilities and coding standards violations.

**Technical Specifications**:
```
Framework:     FastAPI
Language:      Python
ORM:           SQLAlchemy
Migrations:    Alembic
Internal Port: 8003
External Port: 8003
Database:      repo_scanner_db
```

**Scan Capabilities**:
- Static code analysis
- Dependency vulnerability detection
- Secret detection (API keys, passwords)
- Code quality metrics

**Communication Pattern**:
```
Frontend ──HTTP─► Repo Scanner ──SQLAlchemy─► PostgreSQL
                                              (repo_scanner_db)
```

**Container Startup Sequence**:
```bash
alembic upgrade head && uvicorn app:app --host 0.0.0.0 --port 8003
```

---

### Service 3: Crypto Scanner (`crypto-scanner`)

**Purpose**: Performs TLS/SSL security assessments using the ssllabs-scan CLI tool.

**Technical Specifications**:
```
Framework:     FastAPI
Language:      Python
Tool:          ssllabs-scan (command-line)
Internal Port: 8001
External Port: 8001
Database:      None (uses db-service API)
```

**Unique Architecture Decision**:
This service does **NOT** connect directly to PostgreSQL. Instead, it communicates with the database through HTTP requests to `db-service`.

**Communication Pattern**:
```
Crypto Scanner ──HTTP─► DB Service ──SQLAlchemy─► PostgreSQL
                                                  (scan_results_db)
```

**Why This Design?**:
- Decouples scanning logic from database schema
- Allows independent scaling of scan operations
- Simplifies database access control

**Container Startup Sequence**:
```bash
uvicorn app:app --host 0.0.0.0 --port 8001
```

---

### Service 4: System Scanner (`system-scanner`)

**Purpose**: Central server that receives vulnerability data from distributed agents running on monitored systems.

**Technical Specifications**:
```
Framework:     FastAPI
Language:      Python
ORM:           SQLAlchemy
Migrations:    Alembic
Internal Port: 9000
External Port: 9000
Database:      system_scanner_db
```

**Architecture Components**:

1. **API Server** (`api_server.py`):
   - Receives data from agents
   - Stores system vulnerability information
   - Provides query endpoints for frontend

2. **Agents** (Linux/Windows):
   - Lightweight Python scripts
   - Deployed on target systems
   - Collect system information:
     - Installed packages
     - Security patches
     - Configuration vulnerabilities
     - Running services

**Communication Pattern**:
```
┌──────────────────┐
│  Remote Systems  │
│                  │
│  ┌────────────┐  │
│  │ Linux      │  │
│  │ Agent      ├──┼──┐
│  └────────────┘  │  │
│                  │  │ HTTP
│  ┌────────────┐  │  │ POST
│  │ Windows    │  │  │
│  │ Agent      ├──┼──┤
│  └────────────┘  │  │
└──────────────────┘  │
                      ▼
              ┌───────────────┐
              │ System Scanner│
              │ API (:9000)   │
              └───────┬───────┘
                      │ SQLAlchemy
                      ▼
              ┌───────────────┐
              │  PostgreSQL   │
              │ (system_      │
              │  scanner_db)  │
              └───────────────┘
```

**Container Startup Sequence**:
```bash
/usr/local/bin/wait-for-db.sh db-service && \
alembic upgrade head && \
python api_server.py
```

---

## Understanding Docker Environment

### Two Separate Environments

Think of your project as having **two separate environments**:

#### 1. Your Windows PC (Host)
- Where you **edit your code** (Visual Studio Code, etc.)
- Where you run `docker-compose` commands
- Your files are stored here

#### 2. The Docker Containers (Guests)
- Isolated Linux environments where your services **actually run**
- Tools like `python`, `alembic`, and `uvicorn` are installed **here**
- Each container has its own isolated filesystem

```
┌─────────────────────────────────────────────────────────────┐
│                 Your Windows PC (Host)                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Your Code Editor (VS Code)                         │   │
│  │  - Edit: repo_scanner/models.py                     │   │
│  │  - Edit: db-service/main.py                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         │ docker-compose exec               │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Docker Containers (Guests)                │   │
│  │                                                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │ repo-scanner│  │ db-service  │  │  postgres  │ │   │
│  │  │             │  │             │  │            │ │   │
│  │  │ • python    │  │ • python    │  │ • psql     │ │   │
│  │  │ • alembic   │  │ • alembic   │  │ • data/    │ │   │
│  │  │ • uvicorn   │  │ • uvicorn   │  │            │ │   │
│  │  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### The `docker-compose exec` Command

The `docker-compose exec` command is your way of **reaching inside a running container** to use the tools installed there.

**Format**:
```bash
docker-compose exec <service-name> <command>
```

**Examples**:
```bash
# Run alembic inside the repo-scanner container
docker-compose exec repo-scanner alembic revision --autogenerate -m "Add new column"

# Open a bash shell inside the db-service container
docker-compose exec db-service bash

# Check Python version inside a container
docker-compose exec repo-scanner python --version

# Connect to PostgreSQL directly
docker-compose exec postgres psql -U scanuser -d repo_scanner_db
```

---

## Container Networking

### Docker Compose Network Architecture

When you run `docker-compose up`, Docker creates a private virtual network that connects all containers.

```
┌─────────────────────────────────────────────────────────────┐
│              Docker Bridge Network: app_network             │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  frontend    │    │ repo-scanner │    │  db-service  │ │
│  │  :3000       │    │  :8003       │    │  :8002       │ │
│  └───────┬──────┘    └───────┬──────┘    └───────┬──────┘ │
│          │                   │                    │         │
│          └───────────────────┼────────────────────┘         │
│                              │                              │
│  ┌──────────────┐    ┌───────┴──────┐    ┌──────────────┐ │
│  │crypto-scanner│    │  postgres    │    │system-scanner│ │
│  │  :8001       │    │  :5432       │    │  :9000       │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                               │
                               │ Port Mapping
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Host Machine (localhost)                 │
│                                                             │
│  Port 3000 ──► Frontend                                    │
│  Port 8001 ──► Crypto Scanner                              │
│  Port 8002 ──► DB Service                                  │
│  Port 8003 ──► Repo Scanner                                │
│  Port 9000 ──► System Scanner                              │
│  Port 5432 ──► PostgreSQL                                  │
└─────────────────────────────────────────────────────────────┘
```

### Service Discovery by Name

Inside the Docker network, containers reference each other using **service names as hostnames**:

**Example Database Connection Strings**:
```python
# Repo Scanner connecting to PostgreSQL
DATABASE_URL = "postgresql://scanuser:scanpass@postgres:5432/repo_scanner_db"
#                                                  ^^^^^^^^
#                                          Service name (not IP address)

# DB Service connecting to PostgreSQL
DATABASE_URL = "postgresql://scanuser:scanpass@postgres:5432/scan_results_db"

# System Scanner connecting to PostgreSQL
DATABASE_URL = "postgresql://scanuser:scanpass@postgres:5432/system_scanner_db"
```

**Example HTTP Service Calls**:
```python
# Crypto Scanner calling DB Service
response = requests.post("http://db-service:8002/api/scan-results", json=data)
#                                ^^^^^^^^^^
#                         Service name auto-resolves to container IP
```

### Port Mapping Explained

The `ports` section in `docker-compose.yml` creates port forwarding rules:

```yaml
services:
  db-service:
    ports:
      - "8002:8002"
    #    ▲    ▲
    #    │    └─ Internal container port
    #    └────── External host port
```

**Two Communication Scenarios**:

1. **Browser to Service** (External):
   ```
   Browser ──► http://localhost:3000 ──► Host Port 3000 ──► Container Port 3000
   ```

2. **Container to Container** (Internal):
   ```
   Frontend ──► http://repo-scanner:8003 ──► Direct container network
   ```

---

## Database Migration Strategy

### The Problem: Manual Schema Management

**Before Alembic Integration**, the system used SQLAlchemy's `Base.metadata.create_all(bind=engine)`:

```python
# OLD APPROACH (removed)
from models import Base
from database import engine

Base.metadata.create_all(bind=engine)
```

**Critical Limitations**:

1. **Create-Only Behavior**:
   - Can only create tables that don't exist
   - Cannot modify existing tables
   - Adding a new column requires dropping the entire database

2. **Forced Data Loss**:
   ```bash
   # The only way to apply schema changes
   docker-compose down -v  # Destroys all data
   docker-compose up       # Recreates empty database
   ```

3. **Manual ALTER TABLE Commands**:
   ```sql
   -- Had to run manually for each change
   ALTER TABLE scan_results ADD COLUMN overall_security_score INTEGER;
   ```

4. **Team Synchronization Issues**:
   - New developers had no way to know what manual migrations were needed
   - Different environments had different schemas
   - Production updates were error-prone and risky

---

### The Solution: Alembic Migration Framework

**Alembic** is a database migration tool that tracks schema changes over time and applies them safely.

#### What Was Changed

**For Each Service** (`repo-scanner`, `db-service`, `system-scanner`):

1. **Added Alembic Configuration** (`alembic.ini`):
   ```ini
   [alembic]
   script_location = alembic
   sqlalchemy.url = postgresql://user:pass@postgres:5432/database_name
   ```

2. **Created Migration Environment** (`alembic/env.py`):
   ```python
   from models import Base
   target_metadata = Base.metadata
   
   # Alembic uses this to detect schema changes
   ```

3. **Removed Manual Table Creation**:
   ```python
   # REMOVED from app.py / main.py / api_server.py
   # Base.metadata.create_all(bind=engine)
   ```

4. **Updated Dockerfile Startup Command**:
   ```dockerfile
   # OLD
   CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8003"]
   
   # NEW
   CMD alembic upgrade head && uvicorn app:app --host 0.0.0.0 --port 8003
   ```

---

## Database Migration Workflow

### Complete Step-by-Step Process for Making Database Changes

This workflow shows you exactly when and how to use `docker-compose exec` for database migrations.

#### Step 1: Change Your Python Model (On Your PC)

You edit the code on your **Windows PC**. For example, open `repo_scanner/models.py` and add a new column:

```python
# repo_scanner/models.py
class Repository(Base):
    __tablename__ = "repositories"
    
    id = Column(Integer, primary_key=True, index=True)
    repo_url = Column(String, index=True, nullable=False)
    scan_status = Column(String, default="pending")
    
    # YOU ADD THIS NEW COLUMN
    last_commit_sha = Column(String, nullable=True)
```

**Save the file** - but the database doesn't know about this change yet!

---

#### Step 2: Generate the Migration Script (Inside Container)

This is where `docker-compose exec` is **required**. Your project must be running (`docker-compose up -d`).

**Prerequisites**:
```bash
# Ensure services are running
docker-compose ps

# Should show all services as "Up"
```

**Generate the Migration**:
```bash
# Open PowerShell/Terminal and run:
docker-compose exec repo-scanner alembic revision --autogenerate -m "Add last_commit_sha to Repository"
```

**Understanding This Command**:
- `docker-compose exec` = Execute a command inside a running container
- `repo-scanner` = The service name (because you changed models for repo-scanner)
- `alembic revision --autogenerate` = Generate migration automatically
- `-m "..."` = Migration message describing the change

**What Happens**:
1. Alembic (running **inside the container**) connects to PostgreSQL
2. Compares the current database schema with your Python models
3. Detects that `repositories` table is missing the `last_commit_sha` column
4. Creates a new migration file in `repo_scanner/alembic/versions/`

**Generated File** (example):
```python
# repo_scanner/alembic/versions/abc123_add_last_commit_sha.py
"""Add last_commit_sha to Repository

Revision ID: abc123
Revises: def456
Create Date: 2025-01-20 10:30:00.000000
"""

def upgrade():
    op.add_column('repositories', 
                  sa.Column('last_commit_sha', sa.String(), nullable=True))

def downgrade():
    op.drop_column('repositories', 'last_commit_sha')
```

**Which Service to Use?**

The service you specify depends on which models you changed:

| Models Changed | Service to Use |
|---------------|---------------|
| `repo_scanner/models.py` | `repo-scanner` |
| `db-service/models.py` | `db-service` |
| `system-scanner/models.py` | `system-scanner` |

**Generate migrations one service at a time!**

---

#### Step 3: Apply the Migration (Automatic on Restart)

You don't need to manually apply the migration. It's automatically applied when the container restarts.

**Option A: Force Restart and Apply (Recommended)**
```bash
# Rebuild and restart services
docker-compose up -d --build
```

**Option B: Manual Migration (If Needed)**
```bash
# Apply migration without restarting
docker-compose exec repo-scanner alembic upgrade head
```

**What Happens During Restart**:
```bash
# The Dockerfile CMD runs:
alembic upgrade head && uvicorn app:app --host 0.0.0.0 --port 8003
    ▲                       ▲
    │                       └─ Start the application
    └─ Apply all pending migrations first
```

**Verification**:
```bash
# Check migration was applied
docker-compose exec postgres psql -U scanuser -d repo_scanner_db -c "\d repositories"

# Should show the new column:
# last_commit_sha | character varying |
```

---

### Advanced Migration Operations

#### Rolling Back Migrations

**Undo the Last Migration**:
```bash
docker-compose exec repo-scanner alembic downgrade -1
```

**Rollback to Specific Version**:
```bash
# List migration history
docker-compose exec repo-scanner alembic history

# Rollback to specific revision
docker-compose exec repo-scanner alembic downgrade abc123
```

**Rollback Everything**:
```bash
docker-compose exec repo-scanner alembic downgrade base
```

#### Checking Migration Status

**View Current Migration State**:
```bash
docker-compose exec repo-scanner alembic current
```

**View Migration History**:
```bash
docker-compose exec repo-scanner alembic history --verbose
```

#### Manual Migration Creation

For complex changes that autogenerate can't handle:

```bash
# Create empty migration file
docker-compose exec repo-scanner alembic revision -m "Complex data transformation"
```

Then edit the file manually:
```python
# alembic/versions/xyz789_complex_data_transformation.py
def upgrade():
    # Custom SQL for data transformation
    op.execute("""
        UPDATE repositories 
        SET last_commit_sha = 'unknown' 
        WHERE last_commit_sha IS NULL
    """)
    
    # Make column non-nullable
    op.alter_column('repositories', 'last_commit_sha', nullable=False)

def downgrade():
    op.alter_column('repositories', 'last_commit_sha', nullable=True)
```

---

### Migration Benefits

| Aspect | Before (create_all) | After (Alembic) |
|--------|-------------------|----------------|
| **Schema Updates** | ❌ Not possible | ✅ Automated |
| **Data Preservation** | ❌ Must drop DB | ✅ Zero data loss |
| **Version Control** | ❌ No tracking | ✅ Git-committed migrations |
| **Team Sync** | ❌ Manual coordination | ✅ Automatic via migrations |
| **Rollback** | ❌ Impossible | ✅ One command |
| **Production Safety** | ❌ High risk | ✅ Tested, repeatable |

---

### Migration File Structure

```
repo-scanner/
├── alembic/
│   ├── versions/
│   │   ├── 001_initial_schema.py
│   │   ├── 002_add_security_score.py
│   │   └── 003_add_scan_metadata.py
│   └── env.py
├── alembic.ini
├── models.py
└── app.py

db-service/
├── alembic/
│   ├── versions/
│   │   ├── 001_create_scan_results.py
│   │   └── 002_add_crypto_details.py
│   └── env.py
├── alembic.ini
├── models.py
└── main.py

system-scanner/
├── alembic/
│   ├── versions/
│   │   ├── 001_create_vulnerability_tables.py
│   │   └── 002_add_agent_metadata.py
│   └── env.py
├── alembic.ini
├── models.py
└── api_server.py
```

---

## Development Workflow

### Typical Development Cycle

```
┌──────────────────────────────────────────────────────────────┐
│                    Development Workflow                      │
└──────────────────────────────────────────────────────────────┘

1. Edit Code (On Your PC)
   │
   ├─► Change Python models
   ├─► Update business logic
   └─► Modify API endpoints
   
2. Generate Migrations (If models changed)
   │
   └─► docker-compose exec <service> alembic revision --autogenerate -m "..."
   
3. Rebuild and Restart
   │
   └─► docker-compose up -d --build
   
4. Test Changes
   │
   ├─► Access frontend: http://localhost:3000
   ├─► Check API: http://localhost:8003/docs
   └─► View logs: docker-compose logs -f
   
5. Debug Issues (If needed)
   │
   ├─► View specific logs: docker-compose logs -f repo-scanner
   ├─► Check database: docker-compose exec postgres psql ...
   └─► Inspect container: docker-compose exec repo-scanner bash
```

### Common Development Scenarios

#### Scenario 1: Adding a New API Endpoint

```bash
# 1. Edit the code
# Edit repo_scanner/app.py to add new endpoint

# 2. Restart service
docker-compose up -d --build

# 3. Test endpoint
curl http://localhost:8003/api/your-new-endpoint

# 4. View logs if issues
docker-compose logs -f repo-scanner
```

#### Scenario 2: Adding a Database Column

```bash
# 1. Edit model on your PC
# Add column to repo_scanner/models.py

# 2. Generate migration (inside container)
docker-compose exec repo-scanner alembic revision --autogenerate -m "Add new column"

# 3. Apply migration and restart
docker-compose up -d --build

# 4. Verify database change
docker-compose exec postgres psql -U scanuser -d repo_scanner_db -c "\d repositories"
```

#### Scenario 3: Fresh Database Reset

```bash
# WARNING: This deletes ALL data!

# 1. Stop services and remove volumes
docker-compose down -v

# 2. Start fresh
docker-compose up -d --build

# All migrations run automatically, creating fresh database
```

#### Scenario 4: Debugging a Crashing Service

```bash
# 1. Check which services are running
docker-compose ps

# 2. View logs for crashed service
docker-compose logs -f repo-scanner

# 3. Access container shell to investigate
docker-compose exec repo-scanner bash

# 4. Inside container, manually test commands
python -c "from models import Base; print('Models imported successfully')"

# 5. Exit container
exit
```

---

## Debugging and Troubleshooting

### Essential Debugging Commands

#### Viewing Logs

**Real-time Logs for All Services**:
```bash
docker-compose logs -f
```

**Logs for Specific Service**:
```bash
docker-compose logs -f repo-scanner
docker-compose logs -f db-service
docker-compose logs -f postgres
```

**Last 100 Lines**:
```bash
docker-compose logs --tail=100 repo-scanner
```

**Logs Since Specific Time**:
```bash
docker-compose logs --since 2024-01-20T10:00:00 repo-scanner
```

**This is the most important command for debugging. If a service is crashing, its logs will tell you why.**

#### Checking Service Status

**View Running Containers**:
```bash
docker-compose ps
```

**Expected Output**:
```
NAME                    STATUS              PORTS
postgres               Up 5 minutes        0.0.0.0:5432->5432/tcp
db-service             Up 5 minutes        0.0.0.0:8002->8002/tcp
repo-scanner           Up 5 minutes        0.0.0.0:8003->8003/tcp
crypto-scanner         Up 5 minutes        0.0.0.0:8001->8001/tcp
system-scanner         Up 5 minutes        0.0.0.0:9000->9000/tcp
frontend               Up 5 minutes        0.0.0.0:3000->3000/tcp
```

**Check Container Resource Usage**:
```bash
docker stats
```

#### Accessing Container Shell

**Open Bash Shell in Container**:
```bash
# Access repo-scanner container
docker-compose exec repo-scanner bash

# Now you're inside the container - this starts an interactive bash shell session
root@abc123:/app# ls
root@abc123:/app# python --version
root@abc123:/app# exit
```

**What This Command Does**:
- `docker-compose exec` - Execute a command in a running container
- `repo-scanner` - The service name you want to access
- `bash` - Start an interactive bash shell session

Once inside, you have full access to the container's filesystem and can:
- Navigate directories (`cd`, `ls`)
- Run Python scripts manually
- Check installed packages (`pip list`)
- Debug issues interactively
- View configuration files
- Test commands before adding them to code

**Run Single Commands**:
```bash
# Check Python version
docker-compose exec repo-scanner python --version

# List files
docker-compose exec repo-scanner ls -la

# Check environment variables
docker-compose exec repo-scanner env | grep DATABASE
```

#### Database Debugging

**Connect to PostgreSQL**:
```bash
# Open PostgreSQL CLI
docker-compose exec postgres psql -U scanuser -d repo_scanner_db
```

**Common SQL Queries**:
```sql
-- List all tables
\dt

-- Describe a table structure
\d repositories

-- View table data
SELECT * FROM repositories LIMIT 5;

-- Check migration history
SELECT * FROM alembic_version;

-- Exit PostgreSQL
\q
```

**Quick Database Queries from Command Line**:
```bash
# List all databases
docker-compose exec postgres psql -U scanuser -l

# Run single query
docker-compose exec postgres psql -U scanuser -d repo_scanner_db -c "SELECT COUNT(*) FROM repositories;"

# Describe table
docker-compose exec postgres psql -U scanuser -d repo_scanner_db -c "\d repositories"
```

### Common Issues and Solutions

#### Issue 1: Service Won't Start

**Symptom**:
```bash
docker-compose ps
# Shows service as "Exited" or "Restarting"
```

**Solution Steps**:
```bash
# 1. Check logs for error messages
docker-compose logs -f repo-scanner

# 2. Common errors and fixes:

# Error: "connection to server at 'postgres' failed"
# Fix: Database not ready yet, wait 30 seconds and retry
docker-compose restart repo-scanner

# Error: "ModuleNotFoundError: No module named 'fastapi'"
# Fix: Rebuild containers
docker-compose up -d --build

# Error: "alembic.util.exc.CommandError: Can't locate revision"
# Fix: Reset migrations
docker-compose down -v
docker-compose up -d --build
```

#### Issue 2: Database Connection Errors

**Symptom**:
```
sqlalchemy.exc.OperationalError: could not connect to server
```

**Solution**:
```bash
# 1. Check if PostgreSQL is running
docker-compose ps postgres

# 2. Check PostgreSQL logs
docker-compose logs postgres

# 3. Verify connection details
docker-compose exec repo-scanner env | grep DATABASE_URL

# 4. Test connection manually
docker-compose exec postgres psql -U scanuser -d repo_scanner_db -c "SELECT 1;"
```

#### Issue 3: Port Already in Use

**Symptom**:
```
Error: Bind for 0.0.0.0:8003 failed: port is already allocated
```

**Solution**:
```bash
# Option 1: Stop conflicting service
# Find what's using the port
netstat -ano | findstr :8003

# Kill the process (Windows)
taskkill /PID <PID> /F

# Option 2: Change port in docker-compose.yml
# Edit docker-compose.yml:
services:
  repo-scanner:
    ports:
      - "8004:8003"  # Use 8004 on host instead
```

#### Issue 4: Migration Conflicts

**Symptom**:
```
alembic.util.exc.CommandError: Multiple head revisions are present
```

**Solution**:
```bash
# 1. View migration history
docker-compose exec repo-scanner alembic history

# 2. Merge heads
docker-compose exec repo-scanner alembic merge heads -m "Merge migration branches"

# 3. Apply merged migration
docker-compose exec repo-scanner alembic upgrade head
```

#### Issue 5: Container Keeps Restarting

**Symptom**:
```bash
docker-compose ps
# STATUS shows "Restarting (1) 3 seconds ago"
```

**Solution**:
```bash
# 1. Stop the restart loop
docker-compose stop repo-scanner

# 2. Check logs for crash reason
docker-compose logs repo-scanner

# 3. Start manually to see errors
docker-compose run --rm repo-scanner bash
# Inside container:
alembic upgrade head
python app.py
```

### Network Debugging

#### Test Service Connectivity

**From Host to Container**:
```bash
# Test API endpoint
curl http://localhost:8003/api/health

# Test with verbose output
curl -v http://localhost:8003/api/repositories
```

**Between Containers**:
```bash
# Access one container
docker-compose exec frontend sh

# Test connection to backend
wget -O- http://repo-scanner:8003/api/health
```

#### Accessing Container Interactive Shell

**Why Use Interactive Shell (`bash`)**:

The `docker-compose exec <service> bash` command opens an interactive terminal session inside a running container. This is extremely useful for:

**Debugging Purposes**:
```bash
# Start interactive session
docker-compose exec repo-scanner bash

# Now you can interactively debug
root@container:/app# python
>>> from models import Repository
>>> from database import engine
>>> # Test database connection
>>> engine.connect()

# Check what files exist
root@container:/app# ls -la

# View environment variables
root@container:/app# printenv | grep DATABASE

# Test alembic commands
root@container:/app# alembic current
root@container:/app# alembic history

# Install tools for debugging (temporarily)
root@container:/app# pip install ipdb
root@container:/app# python -m ipdb app.py

# Exit when done
root@container:/app# exit
```

**Quick Inspection**:
```bash
# Check if a file exists
docker-compose exec repo-scanner bash -c "ls -la /app/models.py"

# View file contents
docker-compose exec repo-scanner bash -c "cat /app/alembic.ini"

# Check Python imports
docker-compose exec repo-scanner bash -c "python -c 'import fastapi; print(fastapi.__version__)'"
```

**Difference Between `bash` and Single Commands**:
```bash
# Interactive session (bash) - stays open
docker-compose exec repo-scanner bash
# You get a prompt and can run multiple commands

# Single command - runs and exits
docker-compose exec repo-scanner python --version
# Runs the command and immediately returns to your terminal
```

#### Check Container Network

```bash
# List Docker networks
docker network ls

# Inspect network
docker network inspect <network-name>
```

### Performance Debugging

#### Monitor Resource Usage

```bash
# Real-time stats
docker stats

# Check specific container
docker stats repo-scanner
```

#### Check Database Performance

```bash
# Connect to database
docker-compose exec postgres psql -U scanuser -d repo_scanner_db

# Enable query timing
\timing

# Check slow queries
SELECT * FROM pg_stat_activity WHERE state = 'active';

# Check table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Data Model Considerations

### Algorithm Tracking Issue

**Potential Data Inconsistency**:

```python
# Example scan result
scan_result = {
    "total_files": 3,
    "algorithms_detected": {
        "AES": {"files_affected": 2},
        "CBC": {"files_affected": 2},
        "PBKDF2": {"files_affected": 1},
        "SHA-256": {"files_affected": 1}
    }
}

# Sum of files_affected = 2 + 2 + 1 + 1 = 6
# But total_files = 3
```

**Explanation**:

This occurs when **multiple algorithms exist in the same file**:

```python
# crypto_utils.py (1 file, 4 algorithms)
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

key = PBKDF2(password, salt)  # Algorithm 1: PBKDF2
cipher = Cipher(              # Algorithm 2: AES
    algorithms.AES(key),      # Algorithm 3: CBC
    modes.CBC(iv)
)
hash_value = hashlib.sha256() # Algorithm 4: SHA-256
```

**Current Data Model**:

```python
class ScanResult(Base):
    __tablename__ = "scan_results"
    
    id = Column(Integer, primary_key=True)
    repo_url = Column(String)
    total_files = Column(Integer)  # Count of unique files scanned
    
class AlgorithmDetection(Base):
    __tablename__ = "algorithm_detections"
    
    id = Column(Integer, primary_key=True)
    scan_result_id = Column(Integer, ForeignKey("scan_results.id"))
    algorithm_name = Column(String)
    files_affected = Column(Integer)  # Can overlap with other algorithms
```

**Recommendation**:

Add clarity to the data model:

```python
class ScanResult(Base):
    __tablename__ = "scan_results"
    
    total_files = Column(Integer)  # Total unique files scanned
    files_with_crypto = Column(Integer)  # Unique files containing crypto
    total_algorithm_instances = Column(Integer)  # Sum of all occurrences

class AlgorithmDetection(Base):
    __tablename__ = "algorithm_detections"
    
    algorithm_name = Column(String)
    files_affected = Column(Integer)  # Files containing this algorithm
    occurrences = Column(Integer)  # Total times algorithm appears
    
    # IMPORTANT: files_affected can overlap between algorithms
    # because one file can contain multiple algorithms
```

**Alternative: Track File-Algorithm Relationships**:

```python
class FileAlgorithmMapping(Base):
    __tablename__ = "file_algorithm_mappings"
    
    id = Column(Integer, primary_key=True)
    scan_result_id = Column(Integer, ForeignKey("scan_results.id"))
    file_path = Column(String)
    algorithm_name = Column(String)
    line_number = Column(Integer)
    
    __table_args__ = (
        UniqueConstraint('scan_result_id', 'file_path', 'algorithm_name', 
                        name='unique_file_algorithm'),
    )
```

This allows accurate queries like:

```python
# Get unique files with crypto
SELECT DISTINCT file_path FROM file_algorithm_mappings;

# Get all algorithms in a specific file
SELECT algorithm_name FROM file_algorithm_mappings 
WHERE file_path = 'crypto_utils.py';

# Count files per algorithm (accurate)
SELECT algorithm_name, COUNT(DISTINCT file_path) as unique_files
FROM file_algorithm_mappings
GROUP BY algorithm_name;
```

---

## Port Reference Table

| Service | Internal Port | External Port | Access URL |
|---------|--------------|---------------|------------|
| **Frontend** | 3000 | 3000 | http://localhost:3000 |
| **PostgreSQL** | 5432 | 5432 | postgresql://localhost:5432 |
| **DB Service** | 8002 | 8002 | http://localhost:8002 |
| **Repo Scanner** | 8003 | 8003 | http://localhost:8003 |
| **Crypto Scanner** | 8001 | 8001 | http://localhost:8001 |
| **System Scanner** | 9000 | 9000 | http://localhost:9000 |
| **Adminer** | 8080 | 8080 | http://localhost:8080 |
| **Agents** | N/A | N/A | Client-only (no server port) |

---

## System Startup Sequence

```
1. docker-compose up
   │
   ├─► Start PostgreSQL container
   │   └─► Wait for database ready
   │
   ├─► Start DB Service
   │   ├─► Wait for PostgreSQL
   │   ├─► Run: alembic upgrade head
   │   └─► Start FastAPI server
   │
   ├─► Start Repo Scanner
   │   ├─► Wait for PostgreSQL
   │   ├─► Run: alembic upgrade head
   │   └─► Start FastAPI server
   │
   ├─► Start System Scanner
   │   ├─► Wait for DB Service
   │   ├─► Run: alembic upgrade head
   │   └─► Start FastAPI server
   │
   ├─► Start Crypto Scanner
   │   └─► Start FastAPI server (no DB migration)
   │
   └─► Start Frontend
       └─► Start Vite dev server (port 3000)
```

---

## Key Architectural Decisions

### 1. Why Microservices?

- **Independent Scaling**: Scale scanning services independently based on load
- **Technology Flexibility**: Each service can use different tools (ssllabs-scan, custom scanners)
- **Fault Isolation**: One service failure doesn't crash the entire system
- **Team Autonomy**: Different teams can own different services

### 2. Why Single PostgreSQL Instance?

- **Simplified Operations**: One database to backup and monitor
- **ACID Transactions**: Can query across services if needed
- **Cost Efficiency**: No need for multiple database clusters
- **Schema Isolation**: Separate databases provide logical separation

### 3. Why HTTP Between Services?

- **Language Agnostic**: Services can be rewritten in any language
- **Network Transparency**: Easy to split services across machines later
- **Debugging**: Can intercept and inspect HTTP traffic
- **Load Balancing**: Can add reverse proxy easily

### 4. Why Alembic for All Services?

- **Production Readiness**: Industry standard for database migrations
- **Zero-Downtime Deployments**: Apply schema changes without downtime
- **Disaster Recovery**: Version-controlled migrations are part of disaster recovery
- **Team Productivity**: Removes manual database coordination burden

### 5. Why Docker Compose?

- **Environment Consistency**: Same setup on all developer machines
- **Quick Onboarding**: New developers run one command to start everything
- **Integrated Networking**: Automatic service discovery and DNS
- **Development/Production Parity**: Similar architecture in all environments

---

## Quick Reference: Essential Commands

### Daily Development Commands

```bash
# Start everything
docker-compose up -d

# Rebuild after code changes
docker-compose up -d --build

# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f repo-scanner

# Stop everything
docker-compose down

# Fresh start (deletes data!)
docker-compose down -v && docker-compose up -d --build
```

### Migration Commands

```bash
# Generate migration (after model changes)
docker-compose exec <service> alembic revision --autogenerate -m "Description"

# Apply migrations manually
docker-compose exec <service> alembic upgrade head

# Check migration status
docker-compose exec <service> alembic current

# View migration history
docker-compose exec <service> alembic history

# Rollback last migration
docker-compose exec <service> alembic downgrade -1
```

### Database Commands

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U scanuser -d <database_name>

# List databases
docker-compose exec postgres psql -U scanuser -l

# Run quick query
docker-compose exec postgres psql -U scanuser -d repo_scanner_db -c "SELECT COUNT(*) FROM repositories;"

# Describe table
docker-compose exec postgres psql -U scanuser -d repo_scanner_db -c "\d repositories"
```

### Debugging Commands

```bash
# Check container status
docker-compose ps

# Check resource usage
docker stats

# Access container shell
docker-compose exec <service> bash

# Test API endpoint
curl http://localhost:8003/api/health

# Check environment variables
docker-compose exec <service> env
```

---

## Best Practices

### Development Best Practices

1. **Always Check Logs First**
   ```bash
   docker-compose logs -f <service>
   ```
   This solves 90% of debugging issues.

2. **Rebuild After Code Changes**
   ```bash
   docker-compose up -d --build
   ```
   Don't rely on volume mounts for Python code changes.

3. **One Migration Per Logical Change**
   ```bash
   # Good
   alembic revision --autogenerate -m "Add user_email column"
   
   # Bad
   alembic revision --autogenerate -m "Various changes"
   ```

4. **Test Migrations Before Committing**
   ```bash
   # Apply migration
   docker-compose up -d --build
   
   # Test application
   # If something breaks, rollback
   docker-compose exec repo-scanner alembic downgrade -1
   ```

5. **Use Descriptive Service Names in Logs**
   ```bash
   # Instead of scattered print statements
   print("Starting scan...")
   
   # Use proper logging
   import logging
   logger = logging.getLogger(__name__)
   logger.info("Starting scan for repo: %s", repo_url)
   ```

### Database Best Practices

1. **Never Edit Migration Files After Applying**
   - Once a migration is applied, treat it as immutable
   - Create a new migration to fix issues

2. **Always Test Downgrade**
   ```bash
   # After creating migration
   docker-compose exec repo-scanner alembic upgrade head
   docker-compose exec repo-scanner alembic downgrade -1
   docker-compose exec repo-scanner alembic upgrade head
   ```

3. **Add Indexes for Frequently Queried Columns**
   ```python
   class Repository(Base):
       repo_url = Column(String, index=True)  # ✅ Indexed
       scan_status = Column(String, index=True)  # ✅ Indexed
       description = Column(Text)  # ❌ Not indexed (rarely queried)
   ```

4. **Use Database Constraints**
   ```python
   class Repository(Base):
       repo_url = Column(String, nullable=False, unique=True)
       created_at = Column(DateTime, default=datetime.utcnow)
   ```

### Container Best Practices

1. **Always Use `-d` Flag in Production**
   ```bash
   # Development: see logs in real-time
   docker-compose up
   
   # Production: run in background
   docker-compose up -d
   ```

2. **Clean Up Regularly**
   ```bash
   # Remove unused containers
   docker system prune
   
   # Remove unused volumes (careful!)
   docker volume prune
   ```

3. **Monitor Resource Usage**
   ```bash
   # Check if containers are consuming too much
   docker stats
   ```

---

## Summary

This microservices architecture provides:

✅ **Scalability**: Each component scales independently  
✅ **Maintainability**: Clear separation of concerns  
✅ **Reliability**: Fault isolation and automated migrations  
✅ **Developer Experience**: Automated setup and version control  
✅ **Production Ready**: Safe deployments with rollback capability  
✅ **Team Productivity**: Standardized workflows and commands  
✅ **Debugging Friendly**: Comprehensive logging and inspection tools  

The combination of Docker, FastAPI, React, PostgreSQL, and Alembic creates a modern, professional-grade security scanning platform that is both powerful and maintainable.

### Next Steps for New Developers

1. **Clone the Repository**
2. **Run `docker-compose up -d --build`**
3. **Access Frontend**: http://localhost:3000
4. **Check Logs**: `docker-compose logs -f`
5. **Make a Small Change**: Edit a model, generate migration, test
6. **Read the Logs**: Understand what each service does
7. **Explore API Docs**: http://localhost:8003/docs
8. **Try Interactive Shell**: `docker-compose exec repo-scanner bash`

**Welcome to the team! 🚀**