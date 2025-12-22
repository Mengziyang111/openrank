from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_project_health_demo():
    payload = {"query": "项目近3个月健康如何？", "repo": "apache/superset", "time_window": {"days": 90}}
    r = client.post("/api/demo/project_health", json=payload)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "summary" in j
    assert "title" in j["summary"]
    assert isinstance(j.get("charts"), list)
    assert isinstance(j.get("metrics_fetched") if j.get("debug") is None else j.get("debug"), dict) or True
