from fastapi import FastAPI
from app.core.logging import setup_logging
from app.db.init_db import init_db

from app.api.health import router as health_router
from app.api.chat import router as chat_router
from app.api.metrics import router as metrics_router
from app.api.forecast import router as forecast_router
from app.api.monitor import router as monitor_router
from app.api.portfolio import router as portfolio_router
from app.api.graph import router as graph_router

setup_logging()
app = FastAPI(title="OpenSODA OSS Copilot")

@app.on_event("startup")
def _startup():
    init_db()

app.include_router(health_router)
app.include_router(chat_router)
app.include_router(metrics_router)
app.include_router(forecast_router)
app.include_router(monitor_router)
app.include_router(portfolio_router)
app.include_router(graph_router)
