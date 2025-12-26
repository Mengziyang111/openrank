from __future__ import annotations
from datetime import date
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field

class TimeWindow(BaseModel):
    days: int = 90
    start: Optional[str] = None
    end: Optional[str] = None

class ChatRequest(BaseModel):
    query: str = Field(..., description="User query")
    repo: Optional[str] = Field(None, description="owner/repo")
    repos: list[str] = Field(default_factory=list, description="repo list for portfolio")
    portfolio: Optional[str] = None
    time_window: TimeWindow = Field(default_factory=TimeWindow)


class BatchTrendRequest(BaseModel):
    repos: list[str] = Field(..., description="repo list")
    metric: str = Field(..., description="metric name")
    range: str = Field("30d", description="time range like 30d")


class HealthIngestRequest(BaseModel):
    repo_full_name: str = Field(..., description="owner/repo")
    dt: date = Field(..., description="snapshot date")
    metrics: Dict[str, Any] = Field(default_factory=dict, description="flattened metrics map")
    governance_files: Dict[str, Any] = Field(default_factory=dict, description="governance files presence map")
    scorecard_checks: Dict[str, Any] = Field(default_factory=dict, description="Scorecard check detail")
    security_defaulted: bool = Field(False, description="whether a default security score is used")
    raw_payloads: Dict[str, Any] = Field(default_factory=dict, description="optional raw payloads for traceability")
