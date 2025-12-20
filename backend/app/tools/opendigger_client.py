from __future__ import annotations
import datetime as dt
from dataclasses import dataclass
from typing import Any, List
import httpx
from app.core.config import settings

@dataclass(frozen=True)
class MetricRecord:
    date: dt.date
    value: float

def _parse_dt(key: str) -> dt.date:
    key = key.strip()
    if len(key) == 7:
        y, m = key.split("-")
        return dt.date(int(y), int(m), 1)
    if len(key) == 10:
        y, m, d = key.split("-")
        return dt.date(int(y), int(m), int(d))
    raise ValueError(f"Unsupported date key: {key}")

def normalize_metric_json(payload: Any) -> List[MetricRecord]:
    out: List[MetricRecord] = []
    if isinstance(payload, dict):
        for k, v in payload.items():
            try:
                out.append(MetricRecord(_parse_dt(str(k)), float(v)))
            except Exception:
                pass
    out.sort(key=lambda r: r.date)
    return out

class OpenDiggerClient:
    def __init__(self, timeout: float = 20.0):
        self.base_url = settings.OPENDIGGER_BASE_URL
        self.platform = settings.OPENDIGGER_PLATFORM
        self.timeout = timeout

    def metric_url(self, owner: str, repo: str, metric_file: str) -> str:
        return f"{self.base_url}/{self.platform}/{owner}/{repo}/{metric_file}"

    def fetch_metric(self, owner: str, repo: str, metric_file: str) -> List[MetricRecord]:
        url = self.metric_url(owner, repo, metric_file)
        with httpx.Client(timeout=self.timeout, follow_redirects=True) as c:
            r = c.get(url)
            r.raise_for_status()
            return normalize_metric_json(r.json())
