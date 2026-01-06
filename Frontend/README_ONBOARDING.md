# Onboarding UI — usage

This page adds an "Onboarding (CSV / JSON)" tab to the Onboarding page in the frontend.

Use cases:
- Upload CSV files for repositories, servers and domains using the UI
- Paste a JSON payload (structure in `/onboarding_samples/onboarding_example.json`) and submit
- Download sample CSV/JSON files from `/onboarding_samples/`

Endpoints used (default running locally):
- POST http://localhost:8008/api/onboarding  — JSON onboarding
- POST http://localhost:8008/api/onboarding/upload-csv  — multipart CSV upload

How to test:
1. Start the backend and onboarding service (docker compose up -d)
2. Start frontend (dev): `cd Frontend && npm install && npm run dev` (or use dockerized frontend)
3. Open the Onboarding page → select the "Onboarding (CSV / JSON)" tab
4. Upload CSVs or paste JSON and click Submit

Note: Repositories and domains will be scanned automatically after onboarding; servers are recorded for later agent installation and monitoring.
