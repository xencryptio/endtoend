from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_create_org_suborg_app_and_resources():
    # Create organization
    org_payload = {"organization_name": "Test Org"}
    r = client.post("/organizations", json=org_payload)
    assert r.status_code == 200
    org = r.json()
    org_id = org['id']

    # Create suborg
    sub_payload = {"suborganization_name": "Test Sub"}
    r = client.post(f"/organizations/{org_id}/suborganizations", json=sub_payload)
    assert r.status_code == 200
    sub = r.json()
    sub_id = sub['id']

    # Create app
    app_payload = {"application_name": "Test App"}
    r = client.post(f"/suborganizations/{sub_id}/applications", json=app_payload)
    assert r.status_code == 200
    app_obj = r.json()
    app_id = app_obj['id']

    # Create repo under app
    repo_payload = [{"repo_url": "https://github.com/example/test", "repo_name": "test", "application_id": app_id}]
    r = client.post(f"/organizations/{org_id}/repositories/bulk", json=repo_payload)
    assert r.status_code == 200
    repos = r.json()
    assert len(repos) == 1
    assert repos[0]['application_id'] == app_id

    # List apps for suborg
    r = client.get(f"/suborganizations/{sub_id}/applications")
    assert r.status_code == 200
    apps = r.json()
    assert any(a['id'] == app_id for a in apps)
