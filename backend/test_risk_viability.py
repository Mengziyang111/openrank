from datetime import date
from sqlalchemy.orm import Session
from app.db.base import get_db
from app.api.health_overview import get_risk_viability

# Test the function directly
db = next(get_db())
result = get_risk_viability(
    repo="kubernetes/kubernetes",
    start=date(2026, 1, 1),
    end=date(2026, 1, 6),
    db=db
)
print(result)