# Onboarding feature — usage & examples

This document describes how to use the onboarding endpoints and CSV uploads.

## Endpoints (Onboarding Service)
- POST /api/onboarding
  - JSON body (see sample in `samples/onboarding_example.json`)
  - Creates organization, repositories, servers and domains in the DB and triggers scans for repos/domains in background

- POST /api/onboarding/upload-csv
  - multipart/form-data with files: `repositories_file`, `servers_file`, `domains_file` (CSV)
  - Optional form fields: `organization_name`, `created_by`
  - Uses the same flow as JSON onboarding

## Samples
- `onboarding/samples/repositories.csv` — repo list
- `onboarding/samples/servers.csv` — server list
- `onboarding/samples/domains.csv` — domain list
- `onboarding/samples/onboarding_example.json` — full example JSON payload

## How to test locally
1. Build containers and bring them up:

```
docker compose build
docker compose up -d
```

2. After code changes, rebuild and restart only the services you changed (faster):

- Rebuild db-service and apply migrations (db-service already runs `alembic upgrade head` on start):
```
docker compose build db-service
docker compose up -d db-service
```

- Rebuild onboarding service and restart it:
```
docker compose build onboarding
docker compose up -d onboarding
```

3. If you need to run a migration manually inside the `db-service` container:
```
docker compose exec db-service alembic upgrade head
```

4. Example curl (JSON onboarding):

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  --data @onboarding/samples/onboarding_example.json \
  http://localhost:8008/api/onboarding
```


### Hierarchical onboarding (Org → SubOrg → App)

New: The system now supports hierarchical onboarding. The onboarding service should:

1. POST to `/organizations` to create the organization (same as before).
2. POST to `/organizations/{org_id}/suborganizations` to create a sub-organization.
3. POST to `/suborganizations/{suborg_id}/applications` to create an application under the sub-organization.
4. POST repositories/servers/domains including `suborganization_id` and `application_id` to associate them with the app.

See `onboarding/samples/onboarding_example_hierarchical.json` for an example payload and the expected flow.

5. Example curl (CSV upload):

```bash
curl -X POST -F "repositories_file=@onboarding/samples/repositories.csv" \
  -F "servers_file=@onboarding/samples/servers.csv" \
  -F "domains_file=@onboarding/samples/domains.csv" \
  -F "organization_name=Example Corp" \
  http://localhost:8008/api/onboarding/upload-csv
```

## Notes
- Credentials (server secrets) are stored encrypted in `server_credentials.secret_encrypted`. The current implementation stores the field as-is; in production, integrate with Vault or KMS and encrypt before storing.
- Repositories and domains will be scanned automatically after onboarding; servers are recorded but agent installation remains manual.
- If you change models or migrations, increment the Alembic revision and re-run migrations (or let the container run `alembic upgrade head` on startup).
