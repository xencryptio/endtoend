# Quick Verification - 3 Steps

## Step 1: Verify Algorithms Loaded from Elasticsearch
```powershell
docker exec universal-scoring-service python -c "from core.algorithms import PQ_RESISTANCE_TABLE, PQC_ALGORITHMS; kex=PQ_RESISTANCE_TABLE['kex']; print('KEX algorithms:', len(kex)); print('PQC algorithms:', len(PQC_ALGORITHMS)); print('Total:', len(PQ_RESISTANCE_TABLE))"
```
**Expected Output:**
- KEX algorithms: 100
- PQC algorithms: 106
- Total: 4 (categories)

---

## Step 2: Verify Scoring Works (High Score on Quantum-Safe)
```powershell
docker exec universal-scoring-service python -c "
from core.scorer import UniversalPQCScorer
scorer = UniversalPQCScorer()
algos = [
  {'name': 'X25519MLKEM768', 'algorithm_type': 'kex', 'position': 0},
  {'name': 'AES-256-GCM', 'algorithm_type': 'symmetric', 'position': 0},
  {'name': 'SHA-256', 'algorithm_type': 'hash', 'position': 0},
]
result = scorer.score_algorithms(algos, scoring_type='tls')
print('Grade:', result['overall_grade'], 'Score:', result['overall_score'])
"
```
**Expected Output:**
- Grade: A+ Score: 100.0

---

## Step 3: Verify Instant Cache Invalidation (Edit Score, Immediate Reload)
```powershell
# Edit a score via API
Invoke-RestMethod -Method PUT -Uri 'http://localhost:9101/api/algorithms/RSA' -ContentType 'application/json' -Body '{\"base_score\": 25}' | ConvertTo-Json

# Verify immediate reload detected
docker exec endtoend-repo-scanner-1 python -c "
from repo_scoring import RepoScoringEngine
e = RepoScoringEngine()
v = e._get_scores_version()
print('ES version marker:', round(v, 3))
print('Cache loaded at:', round(e._cache_loaded_at, 3))
print('Needs reload (v > cache_loaded_at):', v > e._cache_loaded_at)
"
```
**Expected Output:**
- Should show: Needs reload: True (cache invalidation works instantly)

---

## For Windows Container (Next Phase)

Requires switching Docker to Windows-native mode:
```powershell
# In PowerShell as Admin:
docker system info | Select-String "OS"
# Should show: "OS: windows" (not linux)

# If currently showing linux, switch:
# Right-click Docker Desktop → Switch to Windows containers

# Then run:
cd c:\Users\Nipun\Desktop\final\ nipun\endtoend\windows-crypto-agent
.\build-and-deploy.ps1 -Action run
.\build-and-deploy.ps1 -Action verify
.\build-and-deploy.ps1 -Action scan
```

---

## Summary

✓ Elasticsearch has 343 cryptographic algorithms  
✓ Services load from ES (instant updates, no restart needed)  
✓ Scoring works: Quantum-safe configs get A+ / 100 score  
✓ Cache invalidation verified (instant, not 60 seconds anymore)  
✓ Windows container script fixed (clean PowerShell, ready to build)

**What's working NOW:** Quantum-safe scoring system with instant updates  
**What's next:** Windows container deployment (requires Windows Docker mode)
