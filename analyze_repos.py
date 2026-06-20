import json
import requests

# Get Repo scan full detail response
repo_resp = requests.get('http://localhost:8003/api/scans')
repo_data = repo_resp.json()[0]
scan_id = repo_data['id']

detail_resp = requests.get(f'http://localhost:8003/api/scans/{scan_id}')
detail_data = detail_resp.json()

print('=== ALGORITHMS ===')
if 'algorithms' in detail_data:
    algos = detail_data['algorithms']
    print(f'Type: {type(algos)}')
    print(f'Total: {len(algos) if isinstance(algos, (list, dict)) else "N/A"}')
    if isinstance(algos, list):
        print(f'First item type: {type(algos[0]) if algos else "empty"}')
        print(f'First few items: {algos[:5]}')
    else:
        print(f'Algorithms keys: {list(algos.keys())[:10] if isinstance(algos, dict) else "N/A"}')

print('=== CATEGORY SCORES ===')
if 'category_scores' in detail_data:
    scores = detail_data['category_scores']
    print(f'Type: {type(scores)}')
    if isinstance(scores, list):
        print(f'Count: {len(scores)}')
        print(f'First item: {scores[0] if scores else "empty"}')
    elif isinstance(scores, dict):
        print(f'Keys: {list(scores.keys())}')
        for k, v in scores.items():
            print(f"  {k}: {v}")

print('\n=== MIGRATION PLAN ===')
if 'migration_plan' in detail_data:
    plan = detail_data['migration_plan']
    print(f"Phase: {plan.get('phase')}")
    print(f"Priority: {plan.get('priority')}")
    print(f"Recommendations: {len(plan.get('recommendations', []))} items")
    for rec in plan.get('recommendations', [])[:3]:
        print(f"  - {rec}")

print('\n=== CRITICAL VULNERABILITIES ===')
if 'critical_vulnerabilities' in detail_data and detail_data['critical_vulnerabilities']:
    for vuln in detail_data['critical_vulnerabilities'][:3]:
        print(f"  {vuln}")
else:
    print("  None")

print('\n=== TOTAL ALGORITHMS ===')
print(f"Total Algorithms: {detail_data.get('total_algorithms', 0)}")
print(f"True PQC Count: {detail_data.get('true_pqc_count', 0)}")
print(f"Quantum Safe: {detail_data.get('quantum_safe_count', 0)}")
print(f"Quantum Vulnerable: {detail_data.get('quantum_vulnerable_count', 0)}")
