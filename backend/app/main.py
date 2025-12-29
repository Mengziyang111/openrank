from fastapi import FastAPI
from app.core.logging import setup_logging
from app.db.init_db import init_db
from fastapi.staticfiles import StaticFiles
from app.api.health import router as health_router
from app.api.chat import router as chat_router
from app.api.metrics import router as metrics_router
from app.api.forecast import router as forecast_router
from app.api.monitor import router as monitor_router
from app.api.portfolio import router as portfolio_router
from app.api.graph import router as graph_router
from app.api.dataease import router as dataease_router
from app.api.health_overview import router as health_overview_router
from fastapi.middleware.cors import CORSMiddleware
from app.api.api import api_router
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from app.db.base import SessionLocal
from app.db.models import MetricPoint
from app.services.metric_engine import MetricEngine

setup_logging()
app = FastAPI(title="OpenSODA OSS Copilot")
app.add_middleware(
  CORSMiddleware,
  allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

@app.on_event("startup")
def _startup():
    init_db()
    # Setup nightly backfill job to populate health_overview_daily from metric_points
    scheduler = BackgroundScheduler()

    def _job_backfill():
        with SessionLocal() as db:
            repos = db.query(MetricPoint.repo).distinct().all()
            repos = [r[0] for r in repos]
            engine = MetricEngine()
            for repo in repos:
                dates = db.query(MetricPoint.dt).filter(MetricPoint.repo == repo).distinct().all()
                dates = sorted({d[0] for d in dates})
                for dt_value in dates[-12:]:  # only recent 12 months for nightly job
                    rows = db.query(MetricPoint).filter(MetricPoint.repo == repo, MetricPoint.dt == dt_value).all()
                    metrics = {r.metric: r.value for r in rows}
                    record = engine.compute(
                        repo_full_name=repo,
                        dt_value=dt_value,
                        metrics=metrics,
                        governance_files={},
                        scorecard_checks={},
                    )
                    engine.upsert(db, record)

    scheduler.add_job(_job_backfill, CronTrigger(hour=3, minute=0))  # 03:00 local time
    scheduler.start()

app.include_router(health_router)
app.include_router(chat_router)
app.include_router(metrics_router)
app.include_router(forecast_router)
app.include_router(monitor_router)
app.include_router(portfolio_router)
app.include_router(graph_router)
app.include_router(dataease_router)
app.include_router(health_overview_router)
app.include_router(api_router, prefix="/api")