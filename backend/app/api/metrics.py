from __future__ import annotations
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db.base import get_db
from app.db.models import MetricPoint
from app.schemas.requests import BatchTrendRequest
from app.services.metrics import get_batch_trend, parse_range_days
from app.tools.opendigger_client import OpenDiggerClient

router = APIRouter(prefix="/api", tags=["metrics"])

_METRIC_FILES = {"openrank": "openrank.json", "activity": "activity.json", "attention": "attention.json"}


def _add_months(value: date, months: int) -> date:
    year = value.year + (value.month - 1 + months) // 12
    month = (value.month - 1 + months) % 12 + 1
    day = min(value.day, 28)
    return date(year, month, day)


@router.post("/etl/fetch")
def etl_fetch(repo: str, metrics: list[str] | None = None, db: Session = Depends(get_db)):
    owner, name = repo.split("/", 1)
    client = OpenDiggerClient()
    metrics = metrics or ["openrank", "activity", "attention"]
    for m in metrics:
        mf = _METRIC_FILES.get(m)
        if not mf:
            continue
        recs = client.fetch_metric(owner, name, mf)
        for r in recs:
            row = (
                db.query(MetricPoint)
                .filter(
                    MetricPoint.repo == repo,
                    MetricPoint.metric == m,
                    MetricPoint.dt == r.date,
                )
                .first()
            )
            if row:
                row.value = r.value
            else:
                db.add(MetricPoint(repo=repo, metric=m, dt=r.date, value=r.value))
    db.commit()
    return {"ok": True, "repo": repo, "metrics": metrics}


@router.get("/metrics/trend")
def trend(repo: str, metric: str = Query(...), db: Session = Depends(get_db)):
    rows = (
        db.query(MetricPoint)
        .filter(MetricPoint.repo == repo, MetricPoint.metric == metric)
        .order_by(MetricPoint.dt.asc())
        .all()
    )
    return {
        "repo": repo,
        "metric": metric,
        "points": [{"dt": r.dt.isoformat(), "value": r.value} for r in rows],
    }


@router.get("/metrics/latest")
def latest(repo: str, metric: str = Query(...), months: int = Query(3, ge=1), db: Session = Depends(get_db)):
    latest_row = (
        db.query(MetricPoint)
        .filter(MetricPoint.repo == repo, MetricPoint.metric == metric)
        .order_by(MetricPoint.dt.desc())
        .first()
    )
    if not latest_row:
        return {"repo": repo, "metric": metric, "points": []}
    start_dt = _add_months(latest_row.dt, -months + 1)
    rows = (
        db.query(MetricPoint)
        .filter(
            MetricPoint.repo == repo,
            MetricPoint.metric == metric,
            MetricPoint.dt >= start_dt,
            MetricPoint.dt <= latest_row.dt,
        )
        .order_by(MetricPoint.dt.asc())
        .all()
    )
    return {
        "repo": repo,
        "metric": metric,
        "range": {"start": start_dt.isoformat(), "end": latest_row.dt.isoformat()},
        "points": [{"dt": r.dt.isoformat(), "value": r.value} for r in rows],
    }


@router.get("/metrics/compare")
def compare(
    repo: str,
    metric: str = Query(...),
    window_days: int = Query(30, ge=1),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(MetricPoint)
        .filter(MetricPoint.repo == repo, MetricPoint.metric == metric)
        .order_by(MetricPoint.dt.desc())
        .limit(window_days * 2)
        .all()
    )
    if not rows:
        return {"repo": repo, "metric": metric, "current": None, "previous": None}

    rows = list(reversed(rows))
    split_index = max(len(rows) - window_days, 0)
    previous_rows = rows[:split_index]
    current_rows = rows[split_index:]

    def _avg(values: list[MetricPoint]) -> float | None:
        if not values:
            return None
        return sum(v.value for v in values if v.value is not None) / len(values)

    current_avg = _avg(current_rows)
    previous_avg = _avg(previous_rows)
    delta = None
    delta_pct = None
    if current_avg is not None and previous_avg is not None:
        delta = current_avg - previous_avg
        if previous_avg != 0:
            delta_pct = delta / previous_avg

    return {
        "repo": repo,
        "metric": metric,
        "current": {
            "start": current_rows[0].dt.isoformat() if current_rows else None,
            "end": current_rows[-1].dt.isoformat() if current_rows else None,
            "avg": current_avg,
        },
        "previous": {
            "start": previous_rows[0].dt.isoformat() if previous_rows else None,
            "end": previous_rows[-1].dt.isoformat() if previous_rows else None,
            "avg": previous_avg,
        },
        "delta": delta,
        "delta_pct": delta_pct,
    }


@router.post("/metrics/batch_trend")
def batch_trend(payload: BatchTrendRequest, db: Session = Depends(get_db)):
    if not payload.repos:
        raise HTTPException(status_code=400, detail="repos is required")
    if payload.metric not in _METRIC_FILES:
        raise HTTPException(status_code=400, detail="unsupported metric")
    invalid_repos = [repo for repo in payload.repos if "/" not in repo]
    if invalid_repos:
        raise HTTPException(status_code=400, detail="repos must be in owner/repo format")
    try:
        parse_range_days(payload.range)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return get_batch_trend(payload.repos, payload.metric, payload.range, db)
