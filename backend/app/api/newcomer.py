from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.schemas.requests import NewcomerPlanRequest
from app.services.newcomer_plan import NewcomerPlanService

router = APIRouter(prefix="/newcomer", tags=["newcomer"])


@router.post("/plan")
def generate_plan(payload: NewcomerPlanRequest, db: Session = Depends(get_db)):
    try:
        service = NewcomerPlanService(db)
        return service.build_plan(
            domain=payload.domain,
            stack=payload.stack,
            time_per_week=payload.time_per_week,
            keywords=payload.keywords,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise HTTPException(status_code=500, detail=f"failed to build newcomer plan: {exc}") from exc
