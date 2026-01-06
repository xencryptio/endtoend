# Comprehensive Scan Results Documentation

## 1. WEB SCAN RESULTS (Domain/TLS Scans)

### Location
- **Frontend Component**: `Frontend/src/components/scan/webscan.tsx`
- **API Endpoint**: `http://localhost:8000/results/batch/{batch_id}`
- **Page**: SSL-TLS Scans tab

### Data Structure: `ScanResult` Interface
```typescript
{
  // Batch Information
  request_id: string;                    // Unique identifier (e.g., batch_1767463416_4710)
  batch_id?: string;                     // Batch ID from database
  url: string;                           // Domain URL (e.g., example.com)
  total_urls: number;                    // Total domains in batch
  
  // Batch Status
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scan_status?: 'success' | 'http_skipped' | 'failed' | 'pending';
  requested_at: string;                  // ISO timestamp of request
  execution_time_seconds?: number;       // Total scan duration
  
  // TLS/Certificate Information
  tls_version?: string;                  // e.g., "TLS 1.3"
  cipher_suite_name?: string;            // e.g., "TLS_AES_256_GCM_SHA384"
  cipher_protocol?: string;              // Protocol details
  cipher_strength_bits?: number;         // e.g., 256
  ephemeral_key_exchange?: boolean;      // Is PFS enabled?
  
  // Certificate Details
  cert_subject?: string;                 // Certificate subject
  cert_issuer?: string;                  // Certificate issuer
  cert_serial_number?: string;           // Serial number
  cert_not_before?: string;              // Validity start date
  cert_not_after?: string;               // Validity expiry date
  public_key_algorithm?: string;         // e.g., "RSA", "ECDSA"
  public_key_size_bits?: number;         // e.g., 2048
  
  // Security Headers
  hsts_enabled?: boolean;                // HTTP Strict-Transport-Security
  csp_enabled?: boolean;                 // Content-Security-Policy
  x_frame_options_enabled?: boolean;     // X-Frame-Options header
  ocsp_stapling_active?: boolean;        // OCSP stapling enabled?
  ct_present?: boolean;                  // Certificate Transparency
  
  // Post-Quantum Cryptography Analysis
  quantum_score?: number;                // PQC readiness score (0-100)
  quantum_grade?: string;                // Letter grade (A, B, C, D, F)
  pqc_analysis?: {
    overall_score: number;               // Average score across all components
    overall_grade: string;               // Overall letter grade
    security_level: string;              // e.g., "quantum-safe", "vulnerable"
    quantum_ready: boolean;              // Is quantum-ready?
    hybrid_ready: boolean;               // Supports hybrid cryptography?
    components: {
      kex: ComponentScore;               // Key Exchange analysis
      signature: ComponentScore;         // Signature algorithm analysis
      symmetric: ComponentScore;         // Symmetric encryption analysis
      certificate: ComponentScore;       // Certificate analysis
      protocol: ComponentScore;          // Protocol version analysis
    };
  };
  
  // Component Score Details
  // Each component has:
  // {
  //   weighted_average: number;        // 0-100 score
  //   grade: string;                   // Letter grade
  //   pqc_percentage: number;          // % of PQC-safe algorithms
  //   quantum_safe_count: number;      // Count of quantum-safe items
  // }
  
  // Error & Status
  error_message?: string;                // If scan failed
  
  // Detailed Results
  detailedResults?: ScanResult[];         // Array of per-domain results
  finalDomainProgress?: {
    [domain: string]: {
      status: string;                    // per-domain status
      duration?: number;                 // per-domain duration
    };
  };
  raw_response?: any;                    // Raw API response
}
```

### Information Displayed in UI
1. **Summary Section**:
   - Domain count, total scan time
   - Overall status (success/failed/pending)
   - PQC Grade and Score

2. **Vulnerability/Security Section**:
   - TLS version
   - Cipher suite name and strength
   - Certificate validity dates
   - Security headers status (HSTS, CSP, X-Frame-Options, OCSP)

3. **PQC Analysis Section**:
   - Overall PQC score (0-100)
   - Letter grade (A-F)
   - Quantum readiness: Yes/No
   - Component breakdown:
     - Key Exchange (KEX) grade
     - Signature algorithm grade
     - Symmetric encryption grade
     - Certificate grade
     - Protocol grade

4. **Details View**:
   - Per-domain results
   - Full certificate chain information
   - Detailed cipher suite analysis
   - PQC component breakdown

---

## 2. REPOSITORY SCAN RESULTS (Git/Crypto Scan Results)

### Location
- **Frontend Component**: `Frontend/src/components/git-scan/git-scan.tsx`
- **API Endpoint**: `http://localhost:8003/api/scans/{id}` or `/api/scans` for history
- **Page**: Git Scan tab

### Data Structure: `ScanDetail` Interface
```typescript
{
  // Repository Information
  repo_id: number;                       // Database ID
  repo_url: string;                      // Full GitHub/GitLab URL
  platform: string;                      // e.g., "github", "gitlab"
  branch_name: string;                   // e.g., "main", "master"
  repo_hash: string;                     // Commit hash scanned
  last_scanned: string;                  // ISO timestamp
  
  // File Metrics
  total_files: number;                   // Total files analyzed
  
  // Algorithm Inventory
  algorithms: Record<string, Algorithm>;
  // Where each Algorithm has:
  // {
  //   name: string;                     // e.g., "RSA", "AES-256"
  //   category: string;                 // kex, signature, symmetric, hash
  //   algorithm_type: string;           // Type of algorithm
  //   is_pqc: boolean;                  // Is actual PQC algorithm?
  //   occurrences: number;              // How many times found
  //   files_affected: number;           // In how many files?
  //   base_score: number;               // Base security score
  //   final_score: number;              // Final security score
  //   grade: string;                    // A-F grade
  //   deprecated: boolean;              // Is deprecated?
  //   security_level: string;           // high, medium, low
  //   quantum_safe: boolean;            // Is quantum-safe?
  //   quantum_safety_reason: string;    // Why quantum-safe/not
  //   quantum_resistance_type: string;  // Classification
  //   weighted_score: number;           // Weighted score
  // }
  
  // Quantum Cryptography Metrics
  quantum_safe_count: number;            // Count of quantum-safe algorithms found
  quantum_vulnerable_count: number;      // Count of vulnerable algorithms
  true_pqc_count: number;                // Count of actual PQC algorithms
  quantum_readiness_percentage: number;  // % based on occurrences, not just types
  
  // Security Scores
  overall_security_score: number;        // 0-100 overall score
  overall_grade: string;                 // Letter grade A-F
  
  // Category Breakdown
  category_scores: Record<string, CategoryScore>;
  // Each CategoryScore:
  // {
  //   score: number;                    // Average score for category
  //   grade: string;                    // Letter grade
  //   algorithm_count: number;          // How many algorithms
  //   best_algorithm: string;           // Name of best one
  //   worst_algorithm: string;          // Name of worst one
  // }
}
```

### Information Displayed in UI
1. **Summary Cards**:
   - Repository name
   - Last scanned date/time
   - Overall security grade
   - Total files analyzed
   - Total algorithms found

2. **Quantum Cryptography Metrics**:
   - Quantum safe: X algorithms
   - Quantum vulnerable: Y algorithms
   - True PQC algorithms: Z count
   - Quantum readiness percentage

3. **Security Score**:
   - Overall score (0-100)
   - Letter grade (A-F)
   - Category-wise scores:
     - Key Exchange (KEX) grade
     - Signature algorithm grade
     - Symmetric encryption grade
     - Hash function grade

4. **Algorithm Inventory Table**:
   - Algorithm name
   - Type (KEX/Signature/Symmetric/Hash)
   - Is PQC? (Yes/No)
   - Occurrences count
   - Files affected count
   - Security level
   - Grade
   - Quantum safe status

5. **Detailed View** (when expanding algorithm):
   - Vulnerability details
   - File locations where found
   - Deprecation status
   - Recommended alternatives

---

## 3. PQC SCANS TAB - CRYPTO INVENTORY BY ASSETS

### Location
- **Frontend Component**: `Frontend/src/pages/PQC-Scans.tsx`
- **API Endpoints**:
  - `http://localhost:5001/api/agents` - List agents
  - `http://localhost:5001/api/agent/{id}/results` - Agent results
  - `http://localhost:5001/api/tasks` - Scan tasks
- **Page**: PQC Scans tab → "Crypto Inventory by Assets" section

### Data Structure: `Agent` Interface
```typescript
{
  // Agent Identification
  agent_id: string;                      // Unique agent identifier
  hostname: string;                      // Machine hostname
  ip_address: string;                    // IP address
  os_info: string;                       // Operating System (Windows/Linux)
  status: 'active' | 'inactive';         // Agent connectivity status
  minutes_since_last_seen: number;       // Heartbeat info
  
  // Scan Statistics
  tasks: {
    total: number;                       // Total scan tasks
    pending: number;                     // Pending tasks
    in_progress: number;                 // Currently running
    completed: number;                   // Completed tasks
  };
  results: {
    total: number;                       // Total results received
  };
}
```

### Data Structure: `AuditResult` Interface (Detailed Results)
```typescript
{
  // Result Information
  result_id: string;                     // Unique result ID
  agent_id: string;                      // Which agent generated
  task_id: string;                       // Associated task
  submitted_at: string;                  // When task was queued
  received_at: string;                   // When result received
  
  // Audit Results - LINUX
  with_sudo?: {
    openssl_info?: any;                  // OpenSSL configuration
    boringssl_info?: any;                // BoringSSL info
    aws_lc_info?: any;                   // AWS-LC libraries
    liboqs_info?: any;                   // liboqs (PQC library) presence
    tls_configuration?: any;              // TLS settings
    crypto_modules?: any;                // Kernel crypto modules
  };
  without_sudo?: {
    openssl_versions?: any;              // User-accessible OpenSSL
    liboqs_presence?: any;               // PQC library accessible
  };
  
  // Audit Results - WINDOWS
  cryptoapi_info?: {
    providers?: any;                     // Crypto providers list
    algorithms?: any;                    // Available algorithms
    certificate_stores?: any;            // Installed certificates
    tls_protocols?: any;                 // TLS versions enabled
  };
  tls_ssl_configuration?: {
    enabled_protocols?: string[];        // SSL/TLS versions
    disabled_protocols?: string[];       // Disabled versions
    cipher_suites?: any;                 // Available ciphers
  };
  certificate_stores?: {
    root_certificates?: number;          // Count
    intermediate_certificates?: number;  // Count
    personal_certificates?: number;      // Count
  };
  installed_crypto_software?: {
    openssl?: string;                    // Version if installed
    liboqs?: boolean;                    // PQC support present?
    aws_lc?: string;                     // AWS-LC version if present
  };
  
  // Common Sections
  system_context?: {
    kernel_version?: string;             // OS kernel
    crypto_subsystem_version?: string;   // Crypto libs version
  };
  hardware_crypto?: {
    tpm_present?: boolean;               // TPM available?
    tpm_version?: string;                // TPM version
    intel_aes_ni?: boolean;              // CPU crypto extensions?
  };
  system_security?: {
    selinux_enabled?: boolean;           // Linux security module
    apparmor_enabled?: boolean;          // Linux security module
    bitlocker_status?: string;           // Windows encryption
  };
  
  _metadata?: {
    hostname: string;
    timestamp: string;
    platform: 'Windows' | 'Linux';
    audit_type: string;
  };
}
```

### Information Displayed in UI - Agent Row Summary
1. **Agent Information**:
   - Hostname with status indicator (green=active, red=inactive)
   - Agent ID (first 12 chars)
   - IP address
   - Operating System (Windows/Linux)
   - Status (Active/Inactive with last seen time)

2. **Scan Statistics**:
   - Total scans completed
   - Pending tasks count
   - In-progress tasks count
   - Total results received

3. **Actions**:
   - Trigger new scan button
   - View/Expand results button
   - Retry failed results

### Information Displayed in UI - Expanded Results Details
When clicking to expand an agent's results, shows:

**For Linux Agents**:
- OpenSSL version and configuration
- TLS enabled protocols
- Installed crypto libraries
- Presence of liboqs (PQC library)
- Crypto modules loaded in kernel
- System security modules (SELinux, AppArmor)
- Hardware crypto support (TPM, AES-NI)

**For Windows Agents**:
- CryptoAPI providers available
- TLS/SSL protocols enabled/disabled
- Cipher suites configured
- Certificate stores (root, intermediate, personal)
- Installed OpenSSL/AWS-LC versions
- Crypto API algorithms available
- BitLocker encryption status
- TPM version and status
- Hardware acceleration (AES-NI) support

**Common Details**:
- System kernel/OS version
- Crypto subsystem versions
- Platform information
- Audit timestamp

### Result Sections (Expandable)
Each detailed result can be expanded to show:
1. **OpenSSL Information** - versions, configurations, enabled ciphers
2. **TLS/SSL Configuration** - protocols, cipher suites, certificates
3. **Certificate Information** - root, intermediate, personal cert counts
4. **Installed Crypto Software** - OpenSSL, BoringSSL, AWS-LC, liboqs presence
5. **Hardware Support** - TPM, AES-NI, crypto acceleration
6. **System Security** - SELinux, AppArmor, BitLocker status
7. **Kernel Crypto** - available crypto modules and algorithms

---

## 4. VULNERABILITIES TAB

### Location
- **Frontend Component**: `Frontend/src/pages/Vulnerabilities.tsx`
- **API Endpoint**: `http://localhost:5000/api/apps2` (Backend aggregation)
- **Page**: Vulnerabilities tab in sidebar

### Purpose
Centralized view of all cryptographic vulnerabilities discovered across:
- Repository scans (algorithms used in code)
- Domain scans (TLS/SSL weaknesses)
- System scans (installed crypto library issues)

### Data Structure: `Vulnerability` Interface
```typescript
{
  id: number;                            // Unique identifier
  title: string;                         // Vulnerability name
  severity: 'Critical' | 'High' | 'Medium' | 'Low';  // Severity level
  description: string;                   // Detailed explanation
  affectedSystems: string[];             // Which systems/repos affected
  status: string;                        // Current status
  discoveredDate: string;                // When discovered
}
```

### Data Structure: `AlgorithmData` Interface
```typescript
{
  id: number;                            // Unique ID
  name: string;                          // Algorithm name (e.g., RSA-1024, MD5)
  type: string;                          // kex, signature, symmetric, hash
  strength: number;                      // Strength score (0-100)
  nistStatus: 'Standardized' | 'Draft' | 'Deprecated';  // NIST approval
  isPqc: boolean;                        // Is Post-Quantum Cryptography ready?
  usage: number;                         // Times found across scans
  implementationComplexity: string;      // Complexity level
  description: string;                   // Technical description
  quantumVulnerability: string;          // Quantum vulnerability details
  recommendedReplacement: string;        // Recommended alternative algorithm
  performanceImpact: number;             // Performance impact of replacement
  adoptionRate: number;                  // Current adoption rate %
}
```

### Information Displayed in UI

#### **Metric Cards** (Top Summary)
1. **Critical Issues**: Count of critical vulnerabilities found
2. **High Issues**: Count of high-severity vulnerabilities
3. **Medium Issues**: Count of medium-severity vulnerabilities
4. **Low Issues**: Count of low-severity vulnerabilities
5. **Total Algorithms**: Total unique algorithms detected
6. **Post-Quantum Ready**: Count and % of PQC-compliant algorithms
7. **Legacy Algorithms**: Count and % of deprecated/vulnerable algorithms

#### **Charts Section**
1. **Algorithm Type Distribution**: Pie/bar chart showing:
   - Key Exchange (KEX) algorithms
   - Signature algorithms
   - Symmetric encryption
   - Hash functions
   
2. **Quantum Readiness Overview**: 
   - PQC-ready vs Legacy algorithms comparison
   - Strength distribution across all algorithms

#### **Algorithms Table**
Displays all detected algorithms with columns:
- Algorithm Name (e.g., RSA-2048, AES-256)
- Type (KEX, Signature, Symmetric, Hash)
- Strength Score (0-100)
- NIST Status (Standardized/Draft/Deprecated)
- Is PQC? (Yes/No)
- Usage Count (times found)
- Implementation Complexity
- Description
- Quantum Vulnerability (risk details)
- Recommended Replacement
- Performance Impact (of migrating)
- Adoption Rate (%)

#### **Vulnerability Category Table**
Shows vulnerability categories with:
- Category name
- Severity distribution
- Affected systems count
- Status (resolved/in-progress/unresolved)
- First discovered date
- Remediation priority

### Data Aggregation Strategy
1. **Fetches** `/api/apps2` endpoint (backend aggregates all scans)
2. **Transforms** raw API data to unified format
3. **Aggregates** vulnerabilities from:
   - Repository scans (algorithm findings)
   - Domain scans (TLS/SSL issues)
   - System scans (crypto library vulnerabilities)
4. **Calculates** metrics:
   - Severity counts (Critical/High/Medium/Low)
   - PQC statistics (total/PQC/legacy counts)
   - Type distribution (KEX/Signature/Symmetric/Hash)
5. **Displays** in visual dashboard format

### Key Metrics Calculated
- **Critical Vulnerabilities**: Algorithms with Critical severity
- **Legacy Algorithm %**: (Legacy count / Total count) × 100
- **PQC Readiness %**: (PQC count / Total count) × 100
- **Type Distribution**: Count of algorithms by type (KEX, Signature, etc.)

---

## Summary Comparison

| Aspect | Web Scan | Repo Scan | PQC System Scan | Vulnerabilities Tab |
|--------|----------|-----------|-----------------|---------------------|
| **What it scans** | Domains (TLS/SSL certs) | Code repositories | System crypto inventory | Aggregated view of all |
| **Focus** | Certificate security, TLS config, PQC readiness | Algorithm usage in code | Installed crypto libs & config | Central vulnerability dashboard |
| **Main metrics** | TLS version, cipher strength, cert validity | Algorithm counts, security grades | Library presence, protocol version | Vulnerability counts, severity, recommendations |
| **PQC info** | PQC score/grade per domain | Quantum-safe algorithm count % | PQC library presence (liboqs) | Total PQC-ready vs Legacy % |
| **Result data** | Certificate chains, ciphers | Algorithm inventory | System configuration, cert stores | Aggregated algorithms + vulnerabilities |
| **Granularity** | Per domain | Per repository | Per agent/machine | Global across all scans |
| **Use case** | Secure web services | Secure code development | System hardening & compliance | Risk assessment & prioritization |

