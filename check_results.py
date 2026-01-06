import requests
import json

r = requests.get('http://localhost:8000/results/batch/batch_1767127670_2302')
data = r.json()

print(f"Results count: {len(data.get('results', []))}")
if data.get('results'):
    print(f"First result URL: {data['results'][0].get('url')}")
    print(f"First result PQC score: {data['results'][0].get('pqc_overall_score')}")
else:
    print("No results found")
