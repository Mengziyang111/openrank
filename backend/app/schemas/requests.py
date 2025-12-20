from __future__ import annotations
from typing import Optional
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
