from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db.base import get_db
from app.db.models import MetricPoint
from app.tools.opendigger_client import OpenDiggerClient

router = APIRouter(prefix="/api", tags=["metrics"])

_METRIC_FILES = {"openrank":"openrank.json","activity":"activity.json","attention":"attention.json"}

@router.post("/etl/fetch")
def etl_fetch(repo: str, metrics: list[str] | None = None, db: Session = Depends(get_db)):
    owner, name = repo.split("/", 1)
    client = OpenDiggerClient()
    metrics = metrics or ["openrank","activity","attention"]
    for m in metrics:
        mf = _METRIC_FILES.get(m)
        if not mf:
            continue
        recs = client.fetch_metric(owner, name, mf)
        for r in recs:
            row = db.query(MetricPoint).filter(MetricPoint.repo==repo, MetricPoint.metric==m, MetricPoint.dt==r.date).first()
            if row:
                row.value = r.value
            else:
                db.add(MetricPoint(repo=repo, metric=m, dt=r.date, value=r.value))
    db.commit()
    return {"ok": True, "repo": repo, "metrics": metrics}

@router.get("/metrics/trend")
def trend(repo: str, metric: str = Query(...), db: Session = Depends(get_db)):
    rows = db.query(MetricPoint).filter(MetricPoint.repo==repo, MetricPoint.metric==metric).order_by(MetricPoint.dt.asc()).all()
    return {"repo": repo, "metric": metric, "points": [{"dt": r.dt.isoformat(), "value": r.value} for r in rows]}
