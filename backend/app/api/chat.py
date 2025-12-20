from datetime import datetime
from fastapi import APIRouter
from app.schemas.requests import ChatRequest
from app.schemas.output_schema import OutputSchema, Summary
from app.services.router import route

router = APIRouter(prefix="/api", tags=["chat"])

@router.post("/chat", response_model=OutputSchema)
def chat(req: ChatRequest):
    intent = route(req.query)
    # TODO: call orchestrator + skills + tools
    return OutputSchema(
        request_id="req_demo",
        timestamp=datetime.now().isoformat(),
        scenario=intent["scenario"],
        task=intent["task"],
        input=req.model_dump(),
        summary=Summary(
            headline="TODO: implement agent router/orchestrator",
            status="yellow",
            key_points=["skeleton only"],
            confidence=0.2,
        ),
        evidence_cards=[],
        charts=[],
        actions=[],
        links=[],
        debug={"intent": intent, "tools_used": []},
    )
