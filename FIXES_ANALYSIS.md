# PQC Dashboard & Data Flow - Issues & Fixes

## 🎯 CRITICAL ISSUES FOUND

### 1. **Dashboard API - Missing Suborganizations Structure** ❌
**File:** `db-service/dashboard/builders/full_dashboard.py`
**Problem:** Dashboard only returns flat applications array, no suborganizations grouping
**Impact:** Frontend shows "0 SubOrgs" despite having 3 (AWS, Retail, Prime)

**Current Structure:**
```json
{
  "organization_name": "Amazon Inc.",
  "applications": [app1, app2, app3],  // FLAT - Missing suborg structure
  "suborganizations": []  // EMPTY!
}
```

**Required Structure:**
```json
{
  "organization_name": "Amazon Inc.",
  "suborganizations": [
    {
      "name": "AWS",
      "applications": [EC2]
    },
    {
      "name": "Amazon Retail",
      "applications": [Online Store]
    },
    {
      "name": "Amazon Prime",
      "applications": [Prime Video]
    }
  ],
  "applications": [...]  // Keep for backward compatibility
}
```

---

### 2. **UI Redundancies** ⚠️

#### Vulnerabilities Pages (3 versions!):
- `Frontend/src/pages/Vulnerabilities.tsx` (original)
- `Frontend/src/pages/Vulnerabilities2.tsx` (with empty state)
- `Frontend/src/pages/VulnerabilitiesNew.tsx` (newer version)
**Fix:** Consolidate into ONE page with all features

#### Dashboard/Applications Duplication:
- Both fetch same `/api/dashboard` endpoint
- Both show same metrics differently
- Applications page re-implements dashboard logic
**Fix:** Make Applications page use Dashboard as data source

#### Dashboard Components Redundancy:
- 10+ dashboard component files with overlapping functionality
- Multiple chart components doing similar things
**Fix:** Consolidate into reusable components

---

### 3. **PQC Focus Missing** 🔐

#### Current Dashboard Issues:
- ❌ No prominent "Days Until Q-Day" countdown
- ❌ ML-KEM/Kyber support not highlighted
- ❌ No hybrid crypto adoption metrics
- ❌ Classical vs PQC split not clear
- ❌ No quantum threat severity indicators

#### Recommended PQC-Focused Features:
1. **Q-Day Countdown Widget** - Show estimated time until quantum threat
2. **Hybrid Crypto Adoption Gauge** - X25519MLKEM768 usage percentage  
3. **Algorithm Migration Status Board** - Visual progress for:
   - RSA → ML-KEM
   - ECDSA → ML-DSA
   - SHA-2 → SHA-3
4. **PQC Score Breakdown** - Show:
   - KEX Score (40% weight)
   - Signature Score (20% weight)
   - Symmetric Score (25% weight)
   - Hash Score (15% weight)
5. **Quantum Vulnerability Heatmap** - Risk by application/suborg

---

## 📊 DATA VERIFICATION RESULTS

### ✅ **Working:**
- Onboarding service: HEALTHY (3 apps onboarded)
- TLS Scanner: 4 scans completed  
- Repo Scanner: 3 scans completed
- OQS PQ Scanner: READY (port 8011)
- All services: UP and HEALTHY

### ❌ **Broken:**
- Dashboard SubOrgs: Shows 0 (should be 3)
- TLS Scans API: `/api/scans` returns 404 (correct: `/scans`)
- Applications tab: Redundant with Dashboard

---

## 🔧 FIXES TO IMPLEMENT

### **Priority 1: Fix Dashboard Data Structure**

**File to modify:** `db-service/dashboard/builders/full_dashboard.py`

```python
# ADD after line 260 (organization_view creation):

# Build suborganizations structure
suborg_map = {}
for app in processed_applications:
    suborg_id = app.get("Sub Org ID")
    suborg_name = app.get("Sub Org")
    if suborg_id not in suborg_map:
        suborg_map[suborg_id] = {
            "suborganization_id": suborg_id,
            "suborganization_name": suborg_name,
            "applications": []
        }
    suborg_map[suborg_id]["applications"].append(app)

suborganizations_list = list(suborg_map.values())

# Add to organization_view:
organization_view["suborganizations"] = suborganizations_list
```

---

### **Priority 2: Consolidate Vulnerabilities Pages**

**Actions:**
1. Delete `Vulnerabilities.tsx` and `VulnerabilitiesNew.tsx`
2. Keep only `Vulnerabilities2.tsx` (has empty state handling)
3. Rename to `Vulnerabilities.tsx`
4. Update `App.tsx` routes
5. Update `AppSidebar.tsx` navigation

---

### **Priority 3: Enhance Dashboard for PQC**

**New Components to Add:**

1. **`QDayCountdown.tsx`** - Quantum threat timeline
2. **`HybridCryptoGauge.tsx`** - ML-KEM adoption meter
3. **`AlgorithmMigrationBoard.tsx`** - Migration progress cards
4. **`PQCScoreBreakdown.tsx`** - Component scores visualization
5. **`QuantumThreatHeatmap.tsx`** - Risk distribution map

**Dashboard Layout Changes:**
```tsx
// Top Row: Critical Metrics
<QDayCountdown /> | <HybridCryptoGauge /> | <PQCScoreBreakdown />

// Middle Row: Progress Tracking  
<AlgorithmMigrationBoard />

// Bottom Row: Detailed Analysis
<QuantumThreatHeatmap /> | <ApplicationsRiskChart />
```

---

### **Priority 4: Fix Applications Tab**

**Option A:** Remove Applications tab entirely (redundant with Dashboard drill-down)
**Option B:** Repurpose as "Application Management" with:
- Scan triggers
- Status updates
- Migration timeline editor
- Algorithm profile editor

**Recommended:** Option B - make it action-oriented vs view-oriented

---

## 📈 IMPROVED UI STRUCTURE

### **New Navigation:**
```
Dashboard          → PQC-focused org overview
├─ Sub-Organizations → Drill down to suborg
└─ Applications    → Management & Actions (not just viewing)

Scans & Results
├─ SSL/TLS Scans   → Domain scan history
├─ Repository Scans → Code scan history  
└─ Asset Scans     → System scan history

Risk & Compliance
└─ Vulnerabilities → Consolidated view (network + code + system)

Settings
├─ Onboarding      → Bulk org/app setup
├─ Integration     → API keys, webhooks
└─ Algorithm Profile → Customize scoring
```

---

## 🎨 UI MOCKUP - PQC-Focused Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  🏢 Amazon Inc. - Post-Quantum Cryptography Dashboard       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ⏱️ Q-DAY COUNTDOWN     🔐 HYBRID CRYPTO      📊 PQC SCORE  │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐ │
│  │   1,825      │      │    42%       │      │    72.3   │ │
│  │   Days       │      │  ML-KEM      │      │   Grade C │ │
│  │  (Est. 2029) │      │  Adoption    │      │           │ │
│  └──────────────┘      └──────────────┘      └───────────┘ │
│                                                              │
│  📋 ALGORITHM MIGRATION STATUS                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ RSA → ML-KEM        [████████░░] 80% (8/10 apps)     │  │
│  │ ECDSA → ML-DSA      [████░░░░░░] 40% (4/10 apps)     │  │
│  │ SHA-2 → SHA-3       [██████████] 100% (10/10 apps)   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  🗺️ QUANTUM VULNERABILITY HEATMAP                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  AWS (3 apps)         🔴 HIGH                         │  │
│  │  Amazon Retail (4)    🟡 MEDIUM                       │  │
│  │  Prime Video (3)      🟢 LOW                          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 IMPLEMENTATION STEPS

1. ✅ **Verify Data** - DONE (all scans working)
2. 🔧 **Fix Dashboard API** - Add suborganizations structure
3. 🗑️ **Remove Redundancies** - Consolidate Vulnerabilities pages
4. 🎨 **PQC UI Components** - Build 5 new dashboard widgets
5. 📱 **Update Navigation** - Restructure for PQC focus
6. 🧪 **Test Complete Flow** - Onboard → Scan → View → Act

---

## 📊 EXPECTED OUTCOMES

### User Experience:
- ✅ Immediate visibility into quantum readiness
- ✅ Clear migration roadmap with progress tracking
- ✅ Actionable insights (not just data dumps)
- ✅ No confusion from duplicate pages

### Technical:
- ✅ Proper data hierarchy (Org → SubOrg → App)
- ✅ Faster load times (less redundancy)
- ✅ Maintainable codebase (fewer components)
- ✅ PQC-first architecture

---

## 🎯 NEXT ACTIONS

**Should I proceed with:**
1. ✅ Fix dashboard API to include suborganizations?
2. ✅ Consolidate vulnerabilities pages?
3. ✅ Build PQC-focused dashboard components?
4. ✅ Restructure Applications tab for actions?
5. ✅ All of the above?

**Your approval needed before implementing changes.**
