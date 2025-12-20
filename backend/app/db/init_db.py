from app.db.base import engine, Base
from app.db import models  # noqa: F401

def init_db():
    Base.metadata.create_all(bind=engine)
