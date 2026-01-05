from __future__ import annotations

from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import HealthOverviewDaily, MetricPoint, RepoCatalog
from app.schemas.requests import HealthIngestRequest
from app.services.health_refresh import refresh_health_overview
from app.services.metric_engine import MetricEngine
from app.registry import METRIC_FILES, ensure_supported
from scripts.etl import (
    fetch_metrics as etl_fetch_metrics,
    backfill_health_overview as etl_backfill_ho,
    sync_repo_table as etl_sync_repo_table,
)

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


@router.post("/refresh-today")
def refresh_today(db: Session = Depends(get_db)):
    """Fetch today's snapshot for all repos.

    Previously只刷新 health_overview_daily 里已有的仓库，导致新仓库永远刷不到今天的数据。
    这里改成合并 health_overview_daily 和 metric_points 的去重列表，确保只要抓取过指标就会刷新。
    """

    today = date.today()

    ho_repos = db.execute(select(HealthOverviewDaily.repo_full_name).distinct()).scalars().all()
    mp_repos = db.execute(select(MetricPoint.repo).distinct()).scalars().all()
    rc_repos = db.execute(select(RepoCatalog.repo).distinct()).scalars().all()
    repos = sorted(set(ho_repos) | set(mp_repos) | set(rc_repos))

    if not repos:
        raise HTTPException(status_code=404, detail="no repos found in health_overview_daily or metric_points")

    successes: list[dict] = []
    failures: list[dict] = []

    for repo in repos:
        try:
            payload = refresh_health_overview(db, repo, dt_value=today)
            dt_value = payload.get("dt") if isinstance(payload, dict) else today.isoformat()
            successes.append({"repo": repo, "dt": dt_value})
        except Exception as exc:  # pragma: no cover - network or third-party failures
            db.rollback()
            failures.append({"repo": repo, "error": str(exc)})

    return {
        "data": {
            "date": today.isoformat(),
            "total_repos": len(repos),
            "succeeded": len(successes),
            "failed": failures,
        }
    }


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


@router.post("/bootstrap")
def bootstrap_repo(
    repo_full_name: str = Query(..., description="owner/repo"),
    metrics: str | None = Query("all", description="comma-separated metrics or 'all'"),
    limit_months: int | None = Query(None, description="limit months for backfill (optional)"),
    db: Session = Depends(get_db),
):
    """One-shot: fetch all historical metrics, backfill HO, sync per-repo table, and refresh latest snapshot.

    Returns a summary including ETL counts and the latest snapshot payload.
    """
    # Resolve metrics
    metric_list = list(METRIC_FILES.keys()) if (metrics or "").lower() == "all" else [m.strip() for m in (metrics or "").split(",") if m.strip()]
    ensure_supported(metric_list)

    # 1) ETL: fetch historical OpenDigger metrics into metric_points
    etl_counts = etl_fetch_metrics(repo_full_name, metric_list)

    # 2) Backfill health_overview_daily from metric_points
    ho_snapshots = etl_backfill_ho(repo_full_name, metric_list, limit_months=limit_months)

    # 3) Sync per-repo materialized table
    etl_sync_repo_table(repo_full_name, metric_list)
    sanitized = repo_full_name.replace('/', '_')
    table_name = f"repo_{sanitized}"

    # 4) Refresh latest snapshot with governance + scorecard + raw_payloads
    latest_payload = refresh_health_overview(db, repo_full_name, dt_value=None)

    return {
        "data": {
            "repo": repo_full_name,
            "etl_counts": etl_counts,
            "ho_backfilled": ho_snapshots,
            "per_repo_table": table_name,
            "latest": latest_payload,
        }
    }


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
