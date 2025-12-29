from __future__ import annotations

from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import HealthOverviewDaily
from app.schemas.requests import HealthIngestRequest
from app.services.health_refresh import refresh_health_overview
from app.services.metric_engine import MetricEngine

router = APIRouter(prefix="/api/health", tags=["health_overview"])


def _serialize(model: HealthOverviewDaily) -> dict:
    return MetricEngine.serialize(model)


@router.post("/overview")
def ingest_overview(payload: HealthIngestRequest, db: Session = Depends(get_db)):
    engine = MetricEngine()
    record = engine.compute(
        repo_full_name=payload.repo_full_name,
        dt_value=payload.dt,
        metrics=payload.metrics,
        governance_files=payload.governance_files,
        scorecard_checks=payload.scorecard_checks,
        security_defaulted=payload.security_defaulted,
        raw_payloads=payload.raw_payloads,
    )
    saved = engine.upsert(db, record)
    return {"data": _serialize(saved)}


@router.post("/refresh")
def refresh(
    repo_full_name: str = Query(..., description="owner/repo"),
    dt: date | None = Query(None, description="snapshot date (optional, defaults to today)"),
    db: Session = Depends(get_db),
):
    try:
        data = refresh_health_overview(db, repo_full_name, dt_value=dt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - network or third-party failures
        raise HTTPException(status_code=502, detail=f"refresh failed: {exc}") from exc
    return {"data": data}


@router.post("/backfill")
def backfill(
    repo_full_name: str | None = Query(None, description="owner/repo (optional, backfills all if omitted)"),
    limit_months: int | None = Query(None, description="limit months per repo (optional)"),
    db: Session = Depends(get_db),
):
    """Trigger batch backfill for one or all repos using metric_points.

    Note: runs synchronously; for large datasets consider running scripts/backfill_health_overview.py instead.
    """
    from sqlalchemy import select
    engine = MetricEngine()

    def _backfill_one(repo: str) -> int:
        dates = db.execute(
            select(HealthOverviewDaily.dt).where(HealthOverviewDaily.repo_full_name == repo).distinct()
        ).scalars().all()  # existing snapshots (for info only)

        from app.db.models import MetricPoint
        mp_dates = db.execute(
            select(MetricPoint.dt).where(MetricPoint.repo == repo).distinct()
        ).scalars().all()
        mp_dates = sorted(set(mp_dates))
        if limit_months is not None:
            mp_dates = mp_dates[-int(limit_months):]

        count = 0
        for dt_value in mp_dates:
            rows = db.query(MetricPoint).filter(
                MetricPoint.repo == repo, MetricPoint.dt == dt_value
            ).all()
            metrics = {r.metric: r.value for r in rows}
            record = engine.compute(
                repo_full_name=repo,
                dt_value=dt_value,
                metrics=metrics,
                governance_files={},
                scorecard_checks={},
            )
            engine.upsert(db, record)
            count += 1
        return count

    if repo_full_name:
        rows = _backfill_one(repo_full_name)
        return {"data": {"repo": repo_full_name, "snapshots": rows}}
    else:
        from app.db.models import MetricPoint
        repos = db.execute(select(MetricPoint.repo).distinct()).scalars().all()
        repos = sorted(set(repos))
        results = []
        total = 0
        for repo in repos:
            rows = _backfill_one(repo)
            results.append({"repo": repo, "snapshots": rows})
            total += rows
        return {"data": {"total_snapshots": total, "repos": results}}


@router.get("/overview/latest")
def latest_overview(repo_full_name: str = Query(..., description="owner/repo"), db: Session = Depends(get_db)):
    row = (
        db.query(HealthOverviewDaily)
        .filter(HealthOverviewDaily.repo_full_name == repo_full_name)
        .order_by(HealthOverviewDaily.dt.desc())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="no snapshot found")
    return {"data": _serialize(row)}


@router.get("/overview/by-date")
def overview_by_date(
    repo_full_name: str = Query(..., description="owner/repo"),
    dt: date = Query(..., description="snapshot date"),
    db: Session = Depends(get_db),
):
    row = (
        db.query(HealthOverviewDaily)
        .filter(
            HealthOverviewDaily.repo_full_name == repo_full_name,
            HealthOverviewDaily.dt == dt,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="no snapshot found")
    return {"data": _serialize(row)}
