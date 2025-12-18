# Microservices Security Scanner Architecture

## 1. INTRODUCTION & QUICK START

### 1.1 System Purpose & Overview

This is a **microservices-based security scanning platform** that performs various security assessments including repository scanning, TLS/SSL analysis, and system vulnerability detection. The architecture follows modern cloud-native principles with containerization and service isolation.

#### 1.1.1 Core Problems Solved

- **Manual Audit Elimination**: Replaces time-consuming manual cryptographic audits with automated, scalable scanning
- **Quantum Threat Assessment**: Identifies algorithms vulnerable to quantum computing attacks
- **Compliance Tracking**: Provides quantitative metrics (PQC Readiness Score) for security posture
- **Risk Prioritization**: Delivers detailed reports showing which assets needs immediate remediation

#### 1.1.2 Primary Outputs

1. **PQC Readiness Score**: Quantitative metric (0-100) representing quantum resistance
2. **Detailed Scan Reports**: Algorithm-level findings with security ratings
3. **Actionable Intelligence**: Specific remediation guidance for technical teams

#### 1.1.3 System Actors

- **End Users**: Security analysts, developers, administrators accessing via web interface
- **Scanning Agents**: Automated clients deployed to target environments
- **Backend Services**: Microservices handling orchestration, scanning, scoring, and storage
- **External Systems**: Target websites, Git repositories, and infrastructure being audited

### 1.2 Quick Start Commands

#### 1.2.1 Local Development

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

#### 1.2.2 Cloud Deployment

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

#### 1.2.3 Service Access URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **Frontend** | http://localhost:3000 | Main application UI |
| **Adminer** | http://localhost:8080 | Database management GUI |
| **DB Service API** | http://localhost:8001 | Database API endpoints |
| **Repo Scanner API** | http://localhost:8003 | Repository scanning API |
| **Crypto Scanner API** | http://localhost:8000 | TLS/SSL scanning API |
| **Onboarding API** | http://localhost:8008 | Batch onboarding API |
| **Universal-Scoring API** | http://localhost:9500 | Scoring engine API |
| **System Scanner API** | http://localhost:9000 | System vulnerability API |

### 1.3 Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                       USER LAYER                             │
│  ┌──────────────┐                    ┌──────────────┐       │
│  │   Browser    │                    │  Scanning    │       │
│  │  (React UI)  │                    │   Agents     │       │
│  └──────────────┘                    └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
         │                                        │
         ▼                                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  ORCHESTRATION LAYER                         │
│  ┌──────────────┐         ┌──────────────┐                  │
│  │   Frontend   │         │  Onboarding  │                  │
│  │   (React)    │         │  (Batch Hub) │                  │
│  └──────────────┘         └──────────────┘                  │
└─────────────────────────────────────────────────────────────┘
         │                         │
         └────────┬────────────────┘
                  │
    ┌─────────────┼─────┬─────┬─────┐
    ▼             ▼     ▼     ▼     ▼
┌─────────────────────────────────────────────────────────────┐
│                  SCANNING LAYER (3 Scanners)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Crypto-Scanner│  │ Repo-Scanner │  │System-Scanner (`system-scan`)│      │
│  │  (TLS/SSL)   │  │(Git Repos)   │  │(Infra+Agents)│      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            ▼                                 │
│                   ┌──────────────┐                           │
│                   │  Universal   │                           │
│                   │   Scoring    │                           │
│                   └──────┬───────┘                           │
└──────────────────────────┼──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   DATA ACCESS LAYER                          │
│                  ┌──────────────┐                            │
│                  │  DB Service  │                            │
│                  │   (API)      │                            │
│                  └──────┬───────┘                            │
└─────────────────────────┼──────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   PERSISTENCE LAYER                          │
│                  ┌──────────────┐                            │
│                  │  PostgreSQL  │                            │
│                  └──────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

#### 1.3.1 Architectural Characteristics

- **Pattern**: Microservices Architecture
- **Orchestration**: Docker Compose
- **Data Strategy**: Single PostgreSQL database with multiple schemas
- **Communication**: RESTful HTTP APIs
- **Isolation**: Container-based service isolation

## 2. TECHNOLOGY STACK

### Frontend Technologies

| Component | Technology | Purpose | Why Chosen | Used By |
|---|---|---|---|---|
| **Framework** | React | UI framework | Component-based architecture, large ecosystem | `frontend` |
| **Language** | TypeScript | Type-safe JavaScript | Type safety, better IDE support, fewer runtime errors | `frontend` |
| **Build Tool** | Vite | Fast development server and bundler | Fast HMR, optimized builds, modern developer experience | `frontend` |
| **Styling** | Tailwind CSS | Utility-first CSS framework | Utility-first approach, rapid development, consistency | `frontend` |
| **UI Components** | shadcn/ui + Radix UI | Pre-built accessible components | (not specified) | `frontend` |
| **State Management** | TanStack Query | Server state synchronization | (not specified) | `frontend` |
| **Routing** | React Router | Client-side routing | (not specified) | `frontend` |

### Backend Technologies

| Component | Technology | Purpose | Why Chosen | Used By |
|---|---|---|---|---|
| **Language** | Python 3 | Primary backend language | Rich ecosystem, for data processing and API development | All backend services |
| **Framework** | FastAPI | Web framework for APIs | High performance, automatic validation, async support, OpenAPI docs | All backend services |
| **Server** | Uvicorn | ASGI server | Production-grade server for FastAPI applications | All backend services |
| **ORM** | SQLAlchemy | Database abstraction layer | Robust database abstraction, transaction management | `db-service`, `repo-scanner`, `system-scan` |
| **Migrations** | Alembic | Database schema version control | Version control for database schema changes | `db-service`, `repo-scanner`, `system-scan` |

### Infrastructure & Tools

| Component | Technology | Purpose | Why Chosen | Used By |
|---|---|---|---|---|
| **Database** | PostgreSQL | Relational database | ACID compliance, JSON support, reliability | All backend services (directly or indirectly) |
| **Containerization** | Docker | Service isolation and deployment | Consistent environments, easy deployment | All services |
| **Orchestration** | Docker Compose | Multi-container orchestration | Simplified local development and deployment | All services |

---

## 3. SYSTEM ARCHITECTURE

### 3.1 Architectural Pattern (Microservices)
This platform uses a Microservices Architecture.

### 3.2 System Boundaries

#### 3.2.1 Inside the System
- Frontend React application
- All backend microservices
- Scanning agents (Windows/Linux)
- PostgreSQL database
- Docker container network

#### 3.2.2 Outside the System
- User's web browser
- Target systems being scanned
- External websites/servers for TLS scans
- Git repositories (GitHub, GitLab, etc.)
- Human users

### 3.3 Complete Architecture Diagram
Refer to [Section 1.3 Architecture at a Glance](#13-architecture-at-a-glance) for the complete system architecture diagram.

### 3.4 Core Components Overview
Brief introduction to each layer: User, Orchestration, Workers, Data Access, Persistence.

## 4. MICROSERVICES DEEP DIVE

### 4.1 Frontend Service

#### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND SERVICE                          │
│                                                              │
│  Entry Point                                                 │
│  ┌──────────────┐                                           │
│  │  main.tsx    │──────▶ Renders root component             │
│  └──────────────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │   App.tsx    │──────▶ Root component, routing            │
│  └──────────────┘                                           │
│         │                                                    │
│         ├─────────────┬─────────────┬─────────────┐         │
│         ▼             ▼             ▼             ▼         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   Pages  │  │Components│  │  Hooks   │  │  Utils   │   │
│  │ (Routes) │  │ (UI Lib) │  │ (Logic)  │  │ (Helpers)│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  Communication                                               │
│  └──────▶ REST API calls to backend services                │
│  └──────▶ SSE streams for real-time updates                 │
└─────────────────────────────────────────────────────────────┘
```

#### Component Structure

```
src/
├── main.tsx              # Application entry point
├── App.tsx               # Root component with routing
├── pages/                # Route-level components
│   ├── Dashboard.tsx
│   ├── ScanResults.tsx
│   └── Settings.tsx
├── components/           # Reusable UI components
│   ├── ui/              # Basic UI elements
│   ├── dashboard/       # Dashboard widgets
│   ├── applications/    # App-specific components
│   └── vulnerabilities/ # Vulnerability displays
├── hooks/               # Custom React hooks
│   └── use-mobile.tsx
├── utils/               # Helper functions
├── types/               # TypeScript definitions
├── lib/                 # Third-party integrations
└── image/               # Static assets
```

#### Key Responsibilities

- **User Interface**: Renders all visual elements and handles user interactions
- **State Management**: Manages application state using React hooks and Context
- **API Communication**: Makes HTTP requests to backend services
- **Real-time Updates**: Consumes SSE streams for live scan progress
- **Data Visualization**: Displays charts, tables, and reports
- **Form Handling**: Manages user input and validation

#### Technology Justification

- **React + TypeScript**: Type-safe component development with excellent tooling
- **Vite**: Lightning-fast development with HMR
- **Tailwind CSS**: Rapid UI development with consistent styling
- **Component Architecture**: Highly maintainable and testable codebase

### 4.2 DB Service (`db-service`)

**Purpose**: Central API gateway for database operations, primarily for crypto/TLS scanning results.

**Technical Specifications**:
```
Framework:     FastAPI
Language:      Python
ORM:           SQLAlchemy
Migrations:    Alembic
Internal Port: 8001
External Port: 8001
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

**Data Flow Example**: See **Section 6.2 — Save Scan Result (DB Service)** for a step-by-step diagram that illustrates how scan results are validated, persisted, and acknowledged.

**Container Startup Sequence**:
```bash
alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8001
```

---

### 4.3 Crypto-Scanner Service (`crypto-scanner`)

**Purpose**: Performs TLS/SSL security assessments using the ssllabs-scan CLI tool.

**Technical Specifications**:
```
Framework:     FastAPI
Language:      Python
Tool:          ssllabs-scan (command-line)
Internal Port: 8000
External Port: 8000
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
uvicorn app:app --host 0.0.0.0 --port 8000
```

---

### 4.4 Repo-Scanner Service (`repo-scanner`)

**Purpose**: Scans code repositories for security vulnerabilities and coding standards violations.

**Technical Specifications**:
```
Framework:     FastAPI
Language:      Python
ORM:           SQLAlchemy
Migrations:    Alembic
Internal Port: 8001
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
alembic upgrade head && uvicorn app:app --host 0.0.0.0 --port 8001
```

---

### 4.5 System-Scanner Service (`system-scan`) (Infrastructure Scanning) 

#### Purpose
Collects infrastructure and system-level security information using lightweight agents deployed on target systems (Windows/Linux servers).

#### Architecture Diagram

┌─────────────────────────────────────────────────────────────┐
│              SYSTEM-SCANNER SERVICE (`system-scan`)                          │
│                                                              │
│  API Layer (FastAPI)                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ /register_agent    - Agent registration              │   │
│  │ /fetch_action      - Agent polls for tasks           │   │
│  │ /receive_audit     - Agent submits results           │   │
│  │ /health            - Health check                    │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                                                    │
│         ▼                                                    │
│  ┌────────────────────────────────────────┐                 │
│  │   Agent Manager                        │                 │
│  │   - Track registered agents            │                 │
│  │   - Monitor agent status               │                 │
│  │   - Assign scan tasks                  │                 │
│  └────────────────────────────────────────┘                 │
│         │                                                    │
│         ▼                                                    │
│  ┌────────────────────────────────────────┐                 │
│  │   Result Processor                     │                 │
│  │   - Validate agent data                │                 │
│  │   - Extract system info                │                 │
│  │   - Send to Universal-Scoring          │                 │
│  └────────────────────────────────────────┘                 │
│         │                    │                               │
│         ▼                    ▼                               │
│  Universal-Scoring      DB Service                           │
│     (Scoring)           (Storage)                            │
└─────────────────────────────────────────────────────────────┘
         ▲
         │
   ┌─────┴─────┐
   │  Remote   │
   │  Agents   │
   │(Win/Linux)│
   └───────────┘

#### Key Responsibilities
- **Agent Management:** Register and track deployed agents
- **Task Distribution:** Send scan instructions to agents
- **Data Collection:** Receive system audit results
- **Result Processing:** Extract cryptographic info from system data
- **Scoring Integration:** Send findings to Universal-Scoring

#### Unique Characteristics
- **Distributed Model:** Unlike other scanners, uses remote agents
- **Pull-based:** Agents poll for tasks (firewall-friendly)
- **System-level:** Scans OS packages, configs, running services



### 4.6 Universal-Scoring Service

#### Purpose & Responsibilities
The Universal-Scoring Service is a stateless scoring engine that evaluates cryptographic algorithms and calculates Post-Quantum Cryptography (PQC) readiness scores. It receives algorithm data from all three scanner services and returns quantitative security assessments.

#### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│              UNIVERSAL-SCORING SERVICE                       │
│                    (Business Logic Engine)                   │
│                                                              │
│  API Layer (FastAPI)                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ /api/v1/score/agent-scan  - Score agent data        │   │
│  │ /api/v1/score/tls-scan    - Score TLS data          │   │
│  │ /api/v1/score/repository  - Score repo data         │   │
│  │ /api/v1/score/algorithms  - List all algorithms     │   │
│  │ /health                   - Health check            │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                                                    │
│         ▼                                                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         UniversalPQCScorer Class                       │ │
│  │  ┌──────────────────────────────────────────────────┐ │ │
│  │  │  PQ_RESISTANCE_TABLE (In-Memory)                 │ │ │
│  │  │  - Algorithm name → Security properties          │ │ │
│  │  │  - Base score, PQC status, key size requirements │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  │                                                        │ │
│  │  ┌──────────────────────────────────────────────────┐ │ │
│  │  │  Scoring Logic (core/algorithms.py)              │ │ │
│  │  │  1. Look up algorithm in resistance table        │ │ │
│  │  │  2. Calculate base score                         │ │ │
│  │  │  3. Apply key size penalties                     │ │ │
│  │  │  4. Apply context modifiers (TLS curves, etc.)   │ │ │
│  │  │  5. Return final_score (0-100)                   │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  │                                                        │ │
│  │  ┌──────────────────────────────────────────────────┐ │ │
│  │  │  Aggregation Logic                               │ │ │
│  │  │  1. Group by component (kex, sig, sym, hash)     │ │ │
│  │  │  2. Calculate component scores                   │ │ │
│  │  │  3. Apply weights                                │ │ │
│  │  │  4. Calculate overall_score                      │ │ │
│  │  │  5. Determine quantum_ready status               │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│         │                                                    │
│         ▼                                                    │
│  ┌────────────────────────────────────────┐                 │
│  │  Response (JSON)                       │                 │
│  │  - overall_score: 75.3                 │                 │
│  │  - overall_grade: "B"                  │                 │
│  │  - quantum_ready: false                │                 │
│  │  - component_scores: {...}             │                 │
│  │  - algorithm_details: [...]            │                 │
│  └────────────────────────────────────────┘                 │
│                                                              │
│  NO EXTERNAL DEPENDENCIES - Fully Self-Contained            │
└─────────────────────────────────────────────────────────────┘
```

#### Technical Specifications
```
Framework:     FastAPI
Language:      Python
Internal Port: 9500
External Port: 9500
Database:      None (stateless)
Dependencies:  None (standalone service)
```

#### Scoring Algorithm Flow

```
Input: List of Cryptographic Algorithms

For each algorithm:
  ┌────────────────────────────────────────┐
  │ 1. Algorithm Lookup                    │
  │    - Search PQ_RESISTANCE_TABLE        │
  │    - Get base properties               │
  └────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────┐
  │ 2. Base Score Assignment               │
  │    - Modern (PQC): 100                 │
  │    - Modern: 90                        │
  │    - Legacy: 50                        │
  │    - Deprecated: 0                     │
  └────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────┐
  │ 3. Key Size Evaluation                 │
  │    - Check against minimum requirements│
  │    - Apply penalties for weak keys     │
  │    - RSA < 2048: -40 points            │
  │    - ECC < 256: -30 points             │
  └────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────┐
  │ 4. Context Modifiers                   │
  │    - TLS curve strength                │
  │    - Usage patterns                    │
  │    - Implementation details            │
  └────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────┐
  │ 5. Final Score (0-100)                 │
  └────────────────────────────────────────┘

Aggregate all algorithms:
  ┌────────────────────────────────────────┐
  │ 6. Component Grouping                  │
  │    - Key Exchange algorithms           │
  │    - Signature algorithms              │
  │    - Symmetric algorithms              │
  │    - Hash algorithms                   │
  └────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────┐
  │ 7. Component Score Calculation         │
  │    - Average or weighted average       │
  │    - Per component                     │
  └────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────┐
  │ 8. Overall Score                       │
  │    - Weighted combination:             │
  │      - Key Exchange: 40%               │
  │      - Signatures: 30%                 │
  │      - Symmetric: 20%                  │
  │      - Hash: 10%                       │
  └────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────┐
  │ 9. Grade Assignment                    │
  │    - A: 90-100 (Excellent)             │
  │    - B: 75-89  (Good)                  │
  │    - C: 50-74  (Fair)                  │
  │    - D: 25-49  (Poor)                  │
  │    - F: 0-24   (Critical)              │
  └────────────────────────────────────────┘

Output: Comprehensive Score Report
```

#### Communication Pattern

```
Scanners ──HTTP POST─► Universal-Scoring ──Response─► Scanners
(Crypto/Repo/System)      (Stateless)                (Continue workflow)
```

#### Key Responsibilities
- **Algorithm Analysis**: Evaluates cryptographic strength
- **PQC Assessment**: Determines quantum resistance
- **Score Calculation**: Produces quantitative metrics (0-100)
- **Knowledge Base**: Maintains in-memory cryptographic algorithm database
- **Stateless Processing**: No database dependencies, purely computational

#### Why Stateless?
- **High Performance**: No database I/O overhead
- **Easy Scaling**: Can spin up multiple instances instantly
- **Simple Deployment**: No migration dependencies
- **Consistent Results**: Same input always produces same output

---

### 4.7 Onboarding Service 

#### Purpose
Handles bulk scanning operations by processing Excel file uploads and orchestrating batch scans across the three scanner services.

#### Architecture Diagram

┌─────────────────────────────────────────────────────────────┐
│                  ONBOARDING SERVICE                          │
│                 (Batch Orchestrator)                         │
│                                                              │
│  API Layer (FastAPI)                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ /api/tls-scan/batch   - Batch TLS scanning          │   │
│  │ /api/repo-scan/batch  - Batch repo scanning         │   │
│  │ /api/github/discover  - GitHub repo discovery       │   │
│  │ /api/batch-jobs/{id}  - SSE progress stream         │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                                                    │
│         ▼                                                    │
│  ┌────────────────────────────────────────┐                 │
│  │   Excel File Processor                 │                 │
│  │   - Parse .xlsx/.xls                   │                 │
│  │   - Extract domains/repo URLs          │                 │
│  │   - Validate entries                   │                 │
│  └────────────────────────────────────────┘                 │
│         │                                                    │
│         ▼                                                    │
│  ┌────────────────────────────────────────┐                 │
│  │   Batch Job Manager                    │                 │
│  │   - Create job queue (in-memory)       │                 │
│  │   - Manage concurrency                 │                 │
│  │   - Track progress                     │                 │
│  └────────────────────────────────────────┘                 │
│         │                                                    │
│         ├──────────────────┬────────────────────┐           │
│         ▼                  ▼                    ▼           │
│  Crypto-Scanner       Repo-Scanner       System-Scanner (`system-scan`)     │
│  (Dispatch TLS)       (Dispatch Repo)    (Dispatch Infra)   │
└─────────────────────────────────────────────────────────────┘

#### Key Responsibilities
- **Bulk Operations:** Process large lists of assets
- **File Handling:** Parse Excel files for batch input
- **Orchestration:** Dispatch work to appropriate scanner
- **Progress Tracking:** SSE streams for real-time updates
- **GitHub Integration:** Discover repositories for users/orgs

#### Workflow
1. User uploads Excel file with domains/repos
2. Parse file and extract entries
3. Create batch job with unique ID
4. For each entry:
   - Dispatch to appropriate scanner (crypto/repo/system)
   - Collect results
   - Stream progress via SSE
5. Return completed batch report

---

### 4.8 PostgreSQL Database

#### Purpose
Central persistent datastore for all scan results, job queues, and metadata. Provides ACID-compliant storage with multi-schema isolation for different services.

#### Architecture Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                  POSTGRESQL DATABASE                         │
│                                                              │
│  Database Instance (:5432)                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Database: scan_results_db                           │   │
│  │  ├─ Tables: scan_results, algorithms, scan_batches   │   │
│  │  └─ Used by: DB Service, Crypto-Scanner (indirect)   │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Database: repo_scanner_db                           │   │
│  │  ├─ Tables: repositories, scan_jobs, algorithms      │   │
│  │  └─ Used by: Repo-Scanner (direct)                   │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Database: system_scanner_db                         │   │
│  │  ├─ Tables: agents, vulnerabilities, system_scans    │   │
│  │  └─ Used by: System-Scanner (`system-scan`)                          │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Alembic Version Tables (per database)               │   │
│  │  - alembic_version (tracks migrations)               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### Technical Specifications
```
Database:      PostgreSQL 14+
Port:          5432
Admin User:    postgres
Service User:  scanuser
Persistence:   Docker volume (postgres-data)
Backup:        Volume snapshots
```

#### Database Schemas

| Database Name | Purpose | Primary Service | Tables |
|--------------|---------|----------------|--------|
| scan_results_db | TLS/SSL scan storage | DB Service | scan_results, algorithms, scan_batches |
| repo_scanner_db | Repository scan storage | Repo-Scanner | repositories, scan_jobs, file_algorithms |
| system_scanner_db | Infrastructure scan storage | System-Scanner (`system-scan`) | agents, system_scans, vulnerabilities |

#### Connection Strings

**From Services:**
```python
# DB Service
DATABASE_URL = "postgresql://scanuser:scanpass@postgres:5432/scan_results_db"

# Repo-Scanner
DATABASE_URL = "postgresql://scanuser:scanpass@postgres:5432/repo_scanner_db"

# System-Scanner (`system-scan`)
DATABASE_URL = "postgresql://scanuser:scanpass@postgres:5432/system_scanner_db"
```

**From Host (for admin tasks):**
```
# Recommended: use docker-compose exec (no host port published by default)
docker-compose exec postgres psql -U scanuser -d scan_results_db

# Optional: to connect from host, publish port 5432 in docker-compose.yml and then:
# psql -h localhost -p 5432 -U scanuser -d scan_results_db
```

#### Key Features
- **ACID Compliance**: Ensures data integrity across all operations
- **JSON Support**: Stores complex scan results as JSONB columns
- **Full-Text Search**: Enables searching across scan results
- **Concurrent Access**: Handles multiple services simultaneously
- **Transaction Support**: Atomic operations for complex updates

#### Maintenance Operations

**Backup:**
```bash
# Backup specific database
docker-compose exec postgres pg_dump -U scanuser scan_results_db > backup.sql

# Restore
docker-compose exec -T postgres psql -U scanuser scan_results_db < backup.sql
```

**Check Database Size:**
```bash
docker-compose exec postgres psql -U scanuser -d scan_results_db -c "
SELECT pg_size_pretty(pg_database_size('scan_results_db')) AS size;
"
```

**Vacuum and Analyze:**
```bash
docker-compose exec postgres psql -U scanuser -d scan_results_db -c "VACUUM ANALYZE;"
```

#### Schema Isolation Strategy

**Why Multiple Databases?**
- **Clear Ownership**: Each service owns its database
- **Independent Migrations**: Services can evolve schemas independently
- **Backup Granularity**: Backup/restore individual databases
- **Access Control**: Fine-grained permissions per database
- **Failure Isolation**: Schema corruption doesn't affect other services
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
│  │  :3000       │    │  :8003       │    │  :8001       │ │
│  └───────┬──────┘    └───────┬──────┘    └───────┬──────┘ │
│          │                   │                    │         │
│          └───────────────────┼────────────────────┘         │
│                              │                              │
│  ┌──────────────┐    ┌───────┴──────┐    ┌──────────────┐ │
│  │crypto-scanner│    │  postgres    │    │system-scan│ │
│  │  :8000       │    │  :5432       │    │  :9000       │ │
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
│  Port 8000 ──► Crypto Scanner                              │
│  Port 8001 ──► DB Service                                  │
│  Port 8003 ──► Repo Scanner                                │
│  Port 8008 ──► Onboarding                                  │
│  Port 9500 ──► Universal-Scoring                           │
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
response = requests.post("http://db-service:8001/api/scan-results", json=data)
#                                ^^^^^^^^^^
#                         Service name auto-resolves to container IP
```

### Port Mapping Explained

The `ports` section in `docker-compose.yml` creates port forwarding rules:

```yaml
services:
  db-service:
    ports:
      - "8001:8001"
    #    ▲    ▲
    #    │    └─ Internal container port
    #    └────── External host port
```

**Two Communication Scenarios**:

1. **Browser to Service** (External):
   ```
   Browser ──► http://localhost:3000 ──► Host Port 3000 ──► Container Port 8080
   ```

2. **Container to Container** (Internal):
   ```
   Frontend ──► http://repo-scanner:8001 ──► Direct container network
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

**For Each Service** (`repo-scanner`, `db-service`, `system-scan`):

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
| `system-scaner/models.py` | `system-scan` |

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

system-scaner/
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

## 9. OBSERVABILITY & LOGGING

This section explains how logs are generated, where they are stored, and how developers and operators can view and analyze them across all microservices.

### 9.1 Logging Overview

The system uses a centralized, structured logging strategy across all services.

#### Key Characteristics

**Service-prefixed logs**
Each log line identifies the service that generated it (e.g., SCAN-SERVICE, DB-SERVICE).

**Correlation ID–based tracing**
Every incoming request is assigned a Correlation ID, which is propagated across all downstream services.

**Structured and consistent format**
Logs follow a predictable structure for easy searching and debugging.

**Docker-managed log rotation**
Prevents disk space exhaustion in long-running environments.

### 9.2 Correlation ID Tracing

#### What is a Correlation ID?

A Correlation ID is a unique identifier attached to a request when it enters the system.
The same ID appears in logs across all services involved in processing that request.

#### Example Log Trace
[Corr-ID: abc123] [FRONTEND] User initiated scan
[Corr-ID: abc123] [SCAN-SERVICE] Processing domain: example.com
[Corr-ID: abc123] [DB-SERVICE] Saving scan result
[Corr-ID: abc123] [SCAN-SERVICE] Scan completed
[Corr-ID: abc123] [FRONTEND] Response sent

#### Why This Matters

Enables end-to-end request tracing

Makes debugging distributed systems practical

Eliminates guesswork when errors occur across services

### 9.3 Log Storage & Rotation

#### Docker Environment

Logs are managed by Docker using the json-file logging driver.

```
/var/lib/docker/containers/
└── <container-id>/
    ├── <container-id>-json.log
    ├── <container-id>-json.log.1
    ├── <container-id>-json.log.2
    ├── <container-id>-json.log.3
    ├── <container-id>-json.log.4
    └── <container-id>-json.log.5
```

#### Log Rotation Policy

Configured in docker-compose.yml:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "5"
```

Maximum 10MB per log file

Keeps last 5 rotated files

Prevents disk and memory exhaustion

### 9.4 Viewing Logs

#### 9.4.1 Single Service Logs
```bash
docker-compose logs scan-service
```

#### 9.4.2 Live Streaming
```bash
docker-compose logs -f scan-service
```

#### 9.4.3 Logs with Timestamps
```bash
docker-compose logs -f --timestamps scan-service
```

#### 9.4.4 Multiple Services
```bash
docker-compose logs -f scan-service db-service
```

#### 9.4.5 Last N Lines
```bash
docker-compose logs --tail=100 scan-service
```

### 9.5 Searching & Filtering

#### 9.5.1 Find All Errors
```bash
docker-compose logs | grep ERROR
```

#### 9.5.2 Search by Correlation ID
```bash
docker-compose logs | grep "abc123"
```

#### 9.5.3 Search by Domain or Input
```bash
docker-compose logs scan-service | grep "example.com"
```

#### 9.5.4 Count Errors
```bash
docker-compose logs scan-service | grep -c ERROR
```

### 9.6 Debugging Failed Requests

This section will be integrated with "Debugging & Troubleshooting" (Section 11) later.

### 9.7 Log Levels Reference

| Level | Usage |
|---|---|
| DEBUG | Internal state, detailed diagnostics |
| INFO | Normal application flow |
| WARNING | Recoverable issues |
| ERROR | Failed operations |
| CRITICAL | Service-breaking failures |

### 9.8 Why This Logging Strategy Is Important

- Production-ready observability

- Fast root-cause analysis

- Clear audit trail for security scans

- Scales well with microservice growth

- No external log tools required initially

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
NAME                             STATUS              PORTS
postgres                         Up 5 minutes        (no published ports)
db-service-1                     Up 5 minutes        0.0.0.0:8001->8001/tcp
repo-scanner                     Up 5 minutes        0.0.0.0:8003->8001/tcp
crypto-scanner                   Up 5 minutes        0.0.0.0:8000->8000/tcp
system-scan                      Up 5 minutes        0.0.0.0:9000->9000/tcp
universal-scoring-service        Up 5 minutes        0.0.0.0:9500->9500/tcp
frontend                         Up 5 minutes        0.0.0.0:3000->8080/tcp
onboarding                       Up 5 minutes        0.0.0.0:8008->8008/tcp
adminer                          Up 5 minutes        0.0.0.0:8080->8080/tcp
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
wget -O- http://repo-scanner:8001/api/health
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



## System Startup Sequence

1. PostgreSQL
   └─► Database ready

2. DB Service
   ├─► Wait for PostgreSQL
   ├─► Run migrations
   └─► Start API server

3. Universal-Scoring
   └─► Start (no dependencies)

4. THREE SCANNERS (parallel):
   ├─► Crypto-Scanner
   │   └─► Depends on: Universal-Scoring, DB Service
   │
   ├─► Repo-Scanner
   │   └─► Depends on: PostgreSQL, Universal-Scoring
   │
   └─► System-Scanner (`system-scan`) 
       └─► Depends on: Universal-Scoring, DB Service

5. Onboarding
   └─► Depends on: All three scanners

6. Frontend
   └─► Depends on: Onboarding, All scanners (can call directly)

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

### 12.6 Why Separate Onboarding Service?

**Decision:** Create dedicated orchestrator for batch operations

**Rationale:**
- **Separation of Concerns:** Individual scanners focus on scanning, not batch management
- **Concurrency Control:** Centralized control over parallel scans prevents overload
- **Progress Tracking:** Single source of truth for batch job status
- **File Handling:** Excel parsing isolated from scanning logic
- **SSE Streaming:** Dedicated service for real-time progress updates

**Benefits:**
- Scanners remain stateless and simple
- Easy to add new batch sources (CSV, API imports)
- Can implement advanced queue management
- Better error handling for bulk operations

---

## 13.4 Essential Commands Quick Reference

### Docker Management

```bash
# Start all services in detached mode
docker-compose up -d

# Rebuild images and restart services (USE THIS AFTER CODE CHANGES)
docker-compose up -d --build

# Stop all services
docker-compose down

# Stop all services and remove volumes (fresh start - DELETES ALL DATA)
docker-compose down -v && docker-compose up -d --build

# See which containers are running
docker-compose ps

# Check container resource usage
docker stats
```

### Log Viewing

```bash
# View all logs in real-time
docker-compose logs -f

# View logs for a specific service in real-time
docker-compose logs -f <service-name>
```

### Migration Operations

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

### Database Access

```bash
# Connect to PostgreSQL CLI
docker-compose exec postgres psql -U scanuser -d <database_name>

# List all databases
docker-compose exec postgres psql -U scanuser -l

# Run a quick SQL query (example)
docker-compose exec postgres psql -U scanuser -d repo_scanner_db -c "SELECT COUNT(*) FROM repositories;"

# Describe a table structure (example)
docker-compose exec postgres psql -U scanuser -d repo_scanner_db -c "\d repositories"
```

### Debugging

```bash
# Access container shell for interactive debugging
docker-compose exec <service> bash

# Test an API endpoint (example)
curl http://localhost:8003/api/health

# Check environment variables inside a container
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











#### Key Responsibilities

- **Data Abstraction**: Hides database complexity from other services
- **CRUD Operations**: Provides standard create/read/update/delete
- **Schema Validation**: Ensures data integrity via Pydantic
- **Query Interface**: Offers search and filtering capabilities
- **Connection Management**: Handles database connection pooling
- **Transaction Control**: Manages atomicity and rollbacks

---

## Communication Patterns

### Service Communication Overview

┌──────────────┐
│   Frontend   │
└──────┬───────┘
       │
       ├─────────────────┐
       │                 │
       ▼                 ▼
┌──────────────┐  ┌──────────────┐
│  Onboarding  │  │   Scanners   │
│   (Batch)    │  │  (Direct)    │
└──────┬───────┘  └──────┬───────┘
       │                 │
       └────────┬────────┘
                │
    ┌───────────┼──────────┬──────────┐
    ▼           ▼          ▼          ▼
Crypto-     Repo-      System-    Universal-
Scanner     Scanner    Scanner     Scoring
    │           │          │          │
    └───────────┴──────────┴──────────┘
                │
                ▼
           DB Service
                │
                ▼
           PostgreSQL

**Key Points:**
- Frontend can call scanners directly OR via Onboarding (bulk)
- All three scanners use Universal-Scoring for score calculation
- All three scanners use DB Service for result storage
- Onboarding orchestrates batch operations across scanners


### 1. Synchronous REST API

**Pattern**: Request-Response

```
Service A                    Service B
    │                            │
    │  HTTP POST /endpoint       │
    │───────────────────────────▶│
    │                            │
    │                            │ Process
    │                            │────────┐
    │                            │        │
    │                            │◀───────┘
    │                            │
    │  HTTP 200 + JSON Response  │
    │◀───────────────────────────│
    │                            │
```

**Used For**:
- System-Scanner (`system-scan`) ↔ Universal-Scoring
- System-Scanner (`system-scan`) ↔ DB Service
- Crypto-Scanner ↔ Universal-Scoring
- Crypto-Scanner ↔ DB Service
- Onboarding ↔ Scanner Services

**Advantages**:
- Simple, well-understood
- Immediate response
- Easy error handling

**Disadvantages**:
- Blocking
- Service coupling
- Timeout concerns

---

### 2. Server-Sent Events (SSE)

**Pattern**: Long-lived HTTP connection with streaming updates

```
Client                       Service
  │                             │
  │  GET /scan-with-progress    │
  │────────────────────────────▶│
  │                             │
  │  HTTP 200 (keep-alive)      │
  │◀────────────────────────────│
  │                             │
  │  Event: domain_processing   │
  │◀────────────────────────────│
  │                             │
  │  Event: domain_complete     │
  │◀────────────────────────────│
  │                             │
  │  Event: complete            │
  │◀────────────────────────────│
  │                             │
  │  Connection closed          │
  │◀────────────────────────────│
```

**Used For**:
- Crypto-Scanner progress updates
- Onboarding batch job progress
- Real-time scan feedback to frontend

**Advantages**:
- Real-time updates
- Single connection
- Automatic reconnection (browser)

**Disadvantages**:
- One-way communication
- Resource-intensive for many connections

---

### 3. Asynchronous Job Queue

**Pattern**: Database-backed queue with worker polling

```
API Request              Database Queue           Background Worker
     │                         │                          │
     │  Create job             │                          │
     │────────────────────────▶│                          │
     │                         │                          │
     │  Return job_id          │                          │
     │◀────────────────────────│                          │
     │                         │                          │
     │                         │  Poll for pending jobs   │
     │                         │◀─────────────────────────│
     │                         │                          │
     │                         │  Job found               │
     │                         │─────────────────────────▶│
     │                         │                          │
     │                         │                          │ Process
     │                         │                          │────────┐
     │                         │                          │        │
     │                         │                          │◀───────┘
     │                         │                          │
     │                         │  Update status           │
     │                         │◀─────────────────────────│
     │                         │                          │
     │  Poll for results       │                          │
     │────────────────────────▶│                          │
     │                         │                          │
     │  Results ready          │                          │
     │◀────────────────────────│                          │
```

**Used For**:
- Repo-Scanner job processing
- Long-running tasks
- Background operations

**Advantages**:
- Non-blocking
- Survives restarts
- Scalable workers

**Disadvantages**:
- Delayed processing
- More complex
- Requires polling

---

### 4. Direct Database Access

**Pattern**: Service directly connects to shared database

```
Service                    PostgreSQL
   │                           │
   │  SQLAlchemy Query         │
   │──────────────────────────▶│
   │                           │
   │  Result Set               │
   │◀──────────────────────────│
```

**Used For**:
- Repo-Scanner (direct DB access)
- Internal state management

**Advantages**:
- High performance
- No API overhead
- Transactional integrity

**Disadvantages**:
- Tight coupling
- Schema changes impact service
- Bypasses data access layer

---

## Data Flow Examples

## 6. DATA FLOWS & USE CASES

### 6.1 End-to-End TLS Scan Workflow

```
User                Frontend            Crypto-Scanner        Universal-Scoring      DB Service       PostgreSQL
 │                      │                      │                      │                  │                │
 │ Click "Scan"         │                      │                      │                  │                │
 │─────────────────────▶│                      │                      │                  │                │
 │                      │                      │                      │                  │                │
 │                      │ POST /scan-with-progress                    │                  │                │
 │                      │─────────────────────▶│                      │                  │                │
 │                      │                      │                      │                  │                │
 │                      │ SSE Stream           │                      │                  │                │
 │                      │◀─────────────────────│                      │                  │                │
 │                      │                      │                      │                  │                │
 │ "Processing..."      │                      │ Execute ssllabs-scan │                  │                │
 │◀─────────────────────│                      │──────────┐           │                  │                │
 │                      │                      │          │           │                  │                │
 │                      │                      │◀─────────┘           │                  │                │
 │                      │                      │                      │                  │                │
 │                      │                      │ POST /api/v1/score/tls-scan             │                │
 │                      │                      │─────────────────────▶│                  │                │
 │                      │                      │                      │                  │                │
 │                      │                      │                      │ Calculate Score  │                │
 │                      │                      │                      │──────────┐       │                │
 │                      │                      │                      │          │       │                │
 │                      │                      │                      │◀─────────┘       │                │
 │                      │                      │                      │                  │                │
 │                      │                      │ ◀── Score Response ──│                  │                │
 │                      │                      │                      │                  │                │
 │                      │                      │ POST /scans/result                      │                │
 │                      │                      │─────────────────────────────────────────▶│                │
 │                      │                      │                      │                  │                │
 │                      │                      │                      │                  │ INSERT         │
 │                      │                      │                      │                  │───────────────▶│
 │                      │                      │                      │                  │                │
 │                      │                      │                      │                  │ ◀── ID ────────│
 │                      │                      │                      │                  │                │
 │                      │                      │ ◀────── Success ─────────────────────────│                │
 │                      │                      │                      │                  │                │
 │                      │ SSE: complete        │                      │                  │                │
 │                      │◀─────────────────────│                      │                  │                │
 │                      │                      │                      │                  │                │
 │ "Scan Complete!"     │                      │                      │                  │                │
 │◀─────────────────────│                      │                      │                  │                │
 │                      │                      │                      │                  │                │
 │                      │ GET /scans/results/{id}                     │                  │                │
 │                      │─────────────────────────────────────────────────────────────────▶│                │
 │                      │                      │                      │                  │                │
 │                      │                      │                      │                  │ SELECT         │
 │                      │                      │                      │                  │───────────────▶│
 │                      │                      │                      │                  │                │
 │                      │                      │                      │                  │ ◀── Data ──────│
 │                      │                      │                      │                  │                │
 │                      │ ◀───── Report JSON ──────────────────────────────────────────────│                │
 │                      │                      │                      │                  │                │
 │ Display Report       │                      │                      │                  │                │
 │◀─────────────────────│                      │                      │                  │                │
```

---

### 6.2 Repository Scan Workflow

```
User            Frontend         Repo-Scanner           Universal-Scoring      PostgreSQL
 │                  │                   │                       │                  │
 │ Submit repo URL  │                   │                       │                  │
 │─────────────────▶│                   │                       │                  │
 │                  │                   │                       │                  │
 │                  │ POST /api/scan    │                       │                  │
 │                  │──────────────────▶│                       │                  │
 │                  │                   │                       │                  │
 │                  │                   │ Check cache           │                  │
 │                  │                   │───────────────────────────────────────▶│
 │                  │                   │                       │                  │
 │                  │                   │ ◀────── No cache ─────────────────────────│
 │                  │                   │                       │                  │
 │                  │                   │ INSERT job (pending)  │                  │
 │                  │                   │───────────────────────────────────────▶│
 │                  │                   │                       │                  │
 │                  │ ◀── job_id ───────│                       │                  │
 │                  │                   │                       │                  │
 │ "Job queued"     │                   │                       │                  │
 │◀─────────────────│                   │                       │                  │
 │                  │                   │                       │                  │
 │                  │                   │ [Background Worker]   │                  │
 │                  │                   │                       │                  │
 │                  │                   │ Poll for jobs         │                  │
 │                  │                   │───────────────────────────────────────▶│
 │                  │                   │                       │                  │
 │                  │                   │ ◀── Job found ────────────────────────────│
 │                  │                   │                       │                  │
 │                  │                   │ UPDATE (in_progress)  │                  │
 │                  │                   │───────────────────────────────────────▶│
 │                  │                   │                       │                  │
 │                  │                   │ git clone repo        │                  │
 │                  │                   │────────┐              │                  │
 │                  │                   │        │              │                  │
 │                  │                   │◀───────┘              │                  │
 │                  │                   │                       │                  │
 │                  │                   │ Scan files (regex)    │                  │
 │                  │                   │────────┐              │                  │
 │                  │                   │        │              │                  │
 │                  │                   │◀───────┘              │                  │
 │                  │                   │                       │                  │
 │                  │                   │ POST /api/v1/score/repository            │
 │                  │                   │──────────────────────▶│                  │
 │                  │                   │                       │                  │
 │                  │                   │                       │ Score algos      │
 │                  │                   │                       │──────┐           │
 │                  │                   │                       │      │           │
 │                  │                   │                       │◀─────┘           │
 │                  │                   │                       │                  │
 │                  │                   │ ◀─ Score Response ────│                  │
 │                  │                   │                       │                  │
 │                  │                   │ UPDATE (completed + results)             │
 │                  │                   │───────────────────────────────────────▶│
 │                  │                   │                       │                  │
 │                  │ GET /api/scans/{id}                       │                  │
 │                  │──────────────────▶│                       │                  │
 │                  │                   │                       │                  │
 │                  │                   │ SELECT * FROM repos   │                  │
 │                  │                   │───────────────────────────────────────▶│
 │                  │                   │                       │                  │
 │                  │                   │ ◀──── Results ────────────────────────────│
 │                  │                   │                       │                  │
 │                  │ ◀── Report ───────│                       │                  │
 │                  │                   │                       │                  │
 │ Display Results  │                   │                       │                  │
 │◀─────────────────│                   │                       │                  │
```

---

### 6.2 Save Scan Result (DB Service)

```
Request: Save Scan Result

Client Service         DB Service API          CRUD Layer           SQLAlchemy           PostgreSQL
     │                      │                      │                    │                    │
     │ POST /scans/result   │                      │                    │                    │
     │─────────────────────▶│                      │                    │                    │
     │                      │                      │                    │                    │
     │                      │ Validate Schema      │                    │                    │
     │                      │──────────┐           │                    │                    │
     │                      │          │           │                    │                    │
     │                      │◀─────────┘           │                    │                    │
     │                      │                      │                    │                    │
     │                      │ crud.create_scan_result()                 │                    │
     │                      │─────────────────────▶│                    │                    │
     │                      │                      │                    │                    │
     │                      │                      │ Create Model Instance                   │
     │                      │                      │───────────────────▶│                    │
     │                      │                      │                    │                    │
     │                      │                      │                    │ INSERT INTO ...    │
     │                      │                      │                    │───────────────────▶│
     │                      │                      │                    │                    │
     │                      │                      │                    │ ◀─── ID + Row ─────│
     │                      │                      │                    │                    │
     │                      │                      │ ◀── Model Object ──│                    │
     │                      │                      │                    │                    │
     │                      │ ◀─── Result Dict ────│                    │                    │
     │                      │                      │                    │                    │
     │ ◀─── JSON Response ──│                      │                    │                    │
     │  (200 OK + new ID)   │                      │                    │                    │
```

---

### 6.3 Batch Onboarding Workflow

**Scenario:** User uploads Excel with 100 domains for bulk TLS scanning

**Participants:**
- User (uploads file)
- Frontend (UI)
- Onboarding Service (orchestrator)
- Crypto-Scanner (performs actual scans)
- Universal-Scoring (calculates scores)
- DB Service (stores results)

```
User         Frontend        Onboarding         Crypto-Scanner    Universal-Scoring    DB Service
 │               │                  │                   │                 │                │
 │ Upload Excel  │                  │                   │                 │                │
 │──────────────▶│                  │                   │                 │                │
 │               │                  │                   │                 │                │
 │               │ POST /api/tls-scan/batch             │                 │                │
 │               │─────────────────▶│                   │                 │                │
 │               │                  │                   │                 │                │
 │               │                  │ Parse Excel       │                 │                │
 │               │                  │────────┐          │                 │                │
 │               │                  │        │          │                 │                │
 │               │                  │◀───────┘          │                 │                │
 │               │                  │                   │                 │                │
 │               │                  │ Create batch_jobs[job_id]           │                │
 │               │                  │────────┐          │                 │                │
 │               │                  │        │          │                 │                │
 │               │                  │◀───────┘          │                 │                │
 │               │                  │                   │                 │                │
 │               │ ◀── job_id + URLs ─│                 │                 │                │
 │               │                  │                   │                 │                │
 │ "Processing"  │                  │                   │                 │                │
 │◀──────────────│                  │                   │                 │                │
 │               │                  │                   │                 │                │
 │               │ SSE /api/batch-jobs/{id}             │                 │                │
 │               │─────────────────▶│                   │                 │                │
 │               │                  │                   │                 │                │
 │               │ [Stream opened]  │                   │                 │                │
 │               │◀─────────────────│                   │                 │                │
 │               │                  │                   │                 │                │
 │               │                  │ [Background Task]                   │                │
 │               │                  │                   │                 │                │
 │               │                  │ For each domain:  │                 │                │
 │               │                  │                   │                 │                │
 │               │                  │ POST /scan-with-progress             │                │
 │               │                  │──────────────────▶│                 │                │
 │               │                  │                   │                 │                │
 │               │                  │                   │ Scan            │                │
 │               │                  │                   │─────┐           │                │
 │               │                  │                   │     │           │                │
 │               │                  │                   │◀────┘           │                │
 │               │                  │                   │                 │                │
 │               │                  │                   │ POST /score     │                │
 │               │                  │                   │────────────────▶│                │
 │               │                  │                   │                 │                │
 │               │                  │                   │ ◀─── Score ─────│                │
 │               │                  │                   │                 │                │
 │               │                  │                   │ POST /scans/result               │
 │               │                  │                   │─────────────────────────────────▶│
 │               │                  │                   │                 │                │
 │               │                  │ ◀── Result ───────│                 │                │
 │               │                  │                   │                 │                │
 │               │                  │ Update batch_jobs │                 │                │
 │               │                  │────────┐          │                 │                │
 │               │                  │        │          │                 │                │
 │               │                  │◀───────┘          │                 │                │
 │               │                  │                   │                 │                │
 │               │ SSE: domain_complete                 │                 │                │
 │               │◀─────────────────│                   │                 │                │
 │               │                  │                   │                 │                │
 │ Update UI     │                  │                   │                 │                │
 │◀──────────────│                  │                   │                 │                │
 │               │                  │                   │                 │                │
 │               │                  │ [Repeat for all domains]            │                │
 │               │                  │                   │                 │                │
 │               │ SSE: complete    │                   │                 │                │
 │               │◀─────────────────│                   │                 │                │
 │               │                  │                   │                 │                │
 │ "All Done!"   │                  │                   │                 │                │
 │◀──────────────│                  │                   │                 │                │

---

### 6.4 Agent-Based System Scan

```
Sequence: Agent Submits Audit Results

Scanning Agent                System-Scanner (`system-scan`)    Universal-Scoring (`universal-scoring-service`)    DB Service
      │                            │                         │                    │
      │ POST /receive_audit_result │                         │                    │
      │───────────────────────────▶│                         │                    │
      │                            │                         │                    │
      │                            │ Validate Request        │                    │
      │                            │──────────┐              │                    │
      │                            │          │              │                    │
      │                            │◀─────────┘              │                    │
      │                            │                         │                    │
      │                            │ POST /api/v1/score      │                    │
      │                            │────────────────────────▶│                    │
      │                            │                         │                    │
      │                            │                         │ Calculate Score    │
      │                            │                         │─────────┐          │
      │                            │                         │         │          │
      │                            │                         │◀────────┘          │
      │                            │                         │                    │
      │                            │ ◀───── Score Response ──│                    │
      │                            │                         │                    │
      │                            │ POST /scans/result                           │
      │                            │─────────────────────────────────────────────▶│
      │                            │                                              │
      │                            │ ◀───── Success ──────────────────────────────│
      │                            │                         │                    │
      │ ◀─── Success Response ─────│                         │                    │
      │                            │                         │                    │
```
```

---

## Deployment Architecture

### Docker Compose Network

```
┌────────────────────────────────────────────────────────────────┐
│                     Docker Network: app-network                 │
│                                                                 │
│  ┌──────────────┐         ┌──────────────┐                     │
│  │   frontend   │         │  onboarding  │                     │
│  │   :3000      │         │    :8008     │                     │
│  └──────────────┘         └──────────────┘                     │
│         │                         │                             │
│         └────────────┬────────────┘                             │
│                      │                                          │
│              ┌───────▼──────────┐                               │
│              │   system-scan    │                               │
│              │      :9000       │                               │
│              └───────┬──────────┘                               │
│                      │                                          │
│         ┌────────────┼────────────┬──────────────┐              │
│         │            │            │              │              │
│  ┌──────▼──────┐ ┌──▼──────┐ ┌──▼─────────┐ ┌──▼──────────┐   │
│  │crypto-scanner│ │repo-scanner│ │universal-  │ │ db-service  │   │
│  │    :8000    │ │  :8003    │ │scoring:9500 │ │   :8001     │   │
│  └─────────────┘ └───────────┘ └────────────┘ └──────┬──────┘   │
│                                                      │          │
│                                              ┌───────▼──────┐   │
│                                              │  postgres    │   │
│                                              │    :5432     │   │
│                                              └──────────────┘   │
└────────────────────────────────────────────────────────────────┘

External Access:
- Frontend: http://localhost:3000
- Services: Internal network only (no external ports except for debugging)
```

### Service Configuration

```yaml
services:
  frontend:
    build: ./Frontend
    container_name: frontend
    ports:
      - "3000:8080"
    networks:
      - xencrypt-network

  universal-scoring-service:
    build: ./universal-scoring-service
    container_name: universal-scoring-service
    ports:
      - "9500:9500"
    networks:
      - xencrypt-network

  system-scan:
    build: ./system-scaner
    container_name: system-scan
    ports:
      - "9000:9000"
    environment:
      - DB_SERVICE_URL=http://db-service:8001
      - SCORING_SERVICE_URL=http://universal-scoring-service:9500
    networks:
      - xencrypt-network

  crypto-scanner:
    build: ./scan-service
    container_name: crypto-scanner
    ports:
      - "8000:8000"
    networks:
      - xencrypt-network

  db-service:
    build: ./db-service
    container_name: db-service-1
    ports:
      - "8001:8001"
    networks:
      - xencrypt-network

  repo-scanner:
    build: ./repo_scanner
    ports:
      - "8003:8001"
    networks:
      - xencrypt-network


│  │ /register_agent    - Agent registration              │   │
│  │ /fetch_action      - Task polling                    │   │
│  │ /receive_audit     - Result submission               │   │
│  │ /health            - Health check                    │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                    │                    │          │
│         ▼                    ▼                    ▼          │
│  ┌──────────┐        ┌──────────┐        ┌──────────┐      │
│  │  Agent   │        │   Task   │        │  Result  │      │
│  │  Manager │        │Dispatcher│        │Processor │      │
│  └──────────┘        └──────────┘        └──────────┘      │
│         │                                         │          │
│         │                                         ▼          │
│         │                              ┌────────────────┐   │
│         │                              │ Call Scoring   │   │
│         │                              │    Service     │   │
│         │                              └────────────────┘   │
│         │                                         │          │
│         ▼                                         ▼          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           DB Service API Client                      │   │
│  │  - Store agent info                                  │   │
│  │  - Store scan results                                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         ▲                                           │
         │                                           ▼
   ┌──────────┐                            ┌──────────────────┐
   │ Scanning │                            │ Universal-Scoring│
   │  Agents  │                            │     Service      │
   └──────────┘                            └──────────────────┘
                                                     │
                                                     ▼
                                           ┌──────────────────┐
                                           │   DB Service     │
                                           └──────────────────┘
```

#### Request Flow Example

```
Sequence: Agent Submits Audit Results

Scanning Agent                System-Scanner (`system-scan`)         Universal-Scoring        DB Service
      │                            │                         │                    │
      │ POST /receive_audit_result │                         │                    │
      │───────────────────────────▶│                         │                    │
      │                            │                         │                    │
      │                            │ Validate Request        │                    │
      │                            │──────────┐              │                    │
      │                            │          │              │                    │
      │                            │◀─────────┘              │                    │
      │                            │                         │                    │
      │                            │ POST /api/v1/score      │                    │
      │                            │────────────────────────▶│                    │
      │                            │                         │                    │
      │                            │                         │ Calculate Score    │
      │                            │                         │─────────┐          │
      │                            │                         │         │          │
      │                            │                         │◀────────┘          │
      │                            │                         │                    │
      │                            │ ◀───── Score Response ──│                    │
      │                            │                         │                    │
      │                            │ POST /scans/result                           │
      │                            │─────────────────────────────────────────────▶│
      │                            │                                              │
      │                            │ ◀───── Success ──────────────────────────────│
      │                            │                         │                    │
      │ ◀─── Success Response ─────│                         │                    │
      │                            │                         │                    │
```

#### Key Responsibilities

- **Agent Management**: Tracks registered agents and their status
- **Command & Control**: Dispatches tasks to agents based on system needs
- **Result Processing**: Receives and validates audit data from agents
- **Orchestration**: Coordinates scoring and storage operations
- **Logging**: Comprehensive structured logging for debugging

#### Technology Stack

| Component | Technology | Justification |
|-----------|-----------|---------------|
| Language | Python 3 | Rich libraries for web and data handling |
| Framework | FastAPI | High performance, auto-validation, async support |
| Protocol | REST API | Stateless, scalable, well-understood |
| Container | Docker | Isolated, reproducible environment |

---

## 13. REFERENCE TABLES

### 13.1 Port Reference

| Service | Port | Purpose |
|---------|------|---------|
| Frontend | 3000 | User interface |
| Onboarding | 8008 | Batch operations orchestrator |
| DB Service | 8001 | Data access API |
| Repo-Scanner | 8003 | Git repository scanning |
| Universal-Scoring | 9500 | Scoring engine |
| Crypto-Scanner | 8000 | TLS/SSL scanning |
| System-Scanner (`system-scan`) | 9000 | Infrastructure scanning (agent-based) |
| PostgreSQL | 5432 | Database |

---

#### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   REPO-SCANNER SERVICE                       │
│                                                              │
│  API Layer (FastAPI)                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ /api/scan         - Queue new scan                   │   │
│  │ /api/scans        - List all scans                   │   │
│  │ /api/scans/{id}   - Get scan details                 │   │
│  │ /api/queue/status - Queue summary                    │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                                                    │
│         ▼                                                    │
│  ┌────────────────────────────────────────┐                 │
│  │       Request Handler                  │                 │
│  │  - Validate Git URL                    │                 │
│  │  - Check cache (commit hash)           │                 │
│  │  - Create job in database              │                 │
│  └────────────────────────────────────────┘                 │
│         │                                                    │
│         ▼                                                    │
│  ┌────────────────────────────────────────┐                 │
│  │      PostgreSQL Job Queue              │                 │
│  │  repositories table                    │                 │
│  │  - id, url, branch, status             │                 │
│  │  - pending → in_progress → completed   │                 │
│  └────────────────────────────────────────┘                 │
│         ▲                                                    │
│         │                                                    │
│         │  Background Worker Thread (Polls Queue)           │
│         │                                                    │
│  ┌────────────────────────────────────────┐                 │
│  │      Scan Job Processor                │                 │
│  │  1. Clone repository                   │                 │
│  │  2. Recursively scan files             │                 │
│  │  3. Apply regex patterns               │                 │
│  │  4. Group findings                     │                 │
│  │  5. Call scoring service               │                 │
│  │  6. Save results to database           │                 │
│  └────────────────────────────────────────┘                 │
│         │                    │                               │
│         ▼                    ▼                               │
│  Universal-Scoring      PostgreSQL                           │
│     Service              (Direct)                            │
└─────────────────────────────────────────────────────────────┘
```

#### Job Lifecycle

```
Job States:

pending ──────▶ in_progress ──────▶ completed
                     │
                     │
                     ▼
                  failed


Detailed Flow:

1. API Request Received
   └─▶ /api/scan with repo URL

2. Validation & Caching
   ├─▶ Validate Git URL format
   ├─▶ Temporary clone to get commit hash
   └─▶ Check DB for existing scan of same commit
       ├─▶ If found: Return cached result
       └─▶ If not found: Continue

3. Job Creation
   └─▶ INSERT into repositories table
       - scan_status = 'pending'
       - repo_url, branch_name
       └─▶ Return job_id to client

4. Background Processing (Worker Thread)
   └─▶ Poll: SELECT * WHERE scan_status = 'pending'
       └─▶ For each pending job:
           ├─▶ UPDATE scan_status = 'in_progress'
           │
           ├─▶ Clone repository
           │   └─▶ git clone <url> -b <branch>
           │
           ├─▶ Scan files recursively
           │   └─▶ For each file:
           │       └─▶ Apply 100+ crypto regex patterns
           │           └─▶ Collect matches
           │
           ├─▶ Group findings by algorithm
           │
           ├─▶ Call Universal-Scoring Service
           │   └─▶ POST /api/v1/score/repository
           │
           ├─▶ Save complete report to DB
           │   └─▶ UPDATE repositories SET
           │       - scan_status = 'completed'
           │       - results = <JSON>
           │
           └─▶ Cleanup: Remove cloned repo
```

#### Key Responsibilities

- **Asynchronous Job Queue**: Manages long-running scan jobs
- **Git Operations**: Clones and analyzes source code repositories
- **Pattern Matching**: Searches for 100+ cryptographic patterns
- **State Management**: Tracks job lifecycle in database
- **Caching**: Avoids duplicate scans using commit hashes

---

#### Key Responsibilities

- **Algorithm Analysis**: Evaluates cryptographic strength
- **PQC Assessment**: Determines quantum resistance
- **Score Calculation**: Produces quantitative metrics
- **Knowledge Base**: Maintains cryptographic algorithm database
- **Stateless Processing**: No dependencies, purely computational

---




