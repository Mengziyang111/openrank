from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.services.bootstrap_service import STANDARD_TABLES, bootstrap_dashboard, build_table_data

router = APIRouter(prefix="/api/dataease", tags=["dataease"])


@router.get("/tables")
def list_tables():
    return {"tables": list(STANDARD_TABLES.keys())}


@router.get("/data/{table}")
def table_data(
    table: str,
    repo: str = Query(..., description="owner/repo"),
    window_days: int = Query(90, ge=1, le=365),
    db: Session = Depends(get_db),
):
    try:
        data = build_table_data(db, table, repo, window_days)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"table": table, "repo": repo, "window_days": window_days, "data": data}


@router.post("/bootstrap")
def bootstrap(
    repo: str = Query(..., description="owner/repo"),
    window_days: int = Query(90, ge=7, le=365),
    force: bool = Query(False, description="force recreation even if exists"),
    db: Session = Depends(get_db),
):
    try:
        result = bootstrap_dashboard(db, repo=repo, window_days=window_days, force=force)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result
