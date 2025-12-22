from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.schemas.requests import ChatRequest
from app.schemas.output_schema import OutputSchema
from app.services.orchestrator import run
from app.db.base import get_db

router = APIRouter(prefix="/api/demo", tags=["demo"])

@router.post("/project_health", response_model=OutputSchema)
def project_health(req: ChatRequest, db: Session = Depends(get_db)):
    """Demo endpoint for project health snapshot using mock data by default."""
    intent = {"scenario": "demo", "task": "project_health"}
    return run(req, intent, db)
