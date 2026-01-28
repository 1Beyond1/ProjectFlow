"""
Pydantic schemas for API payloads.
"""
from typing import Optional, List

from pydantic import BaseModel, Field


class TaskItem(BaseModel):
    title: str
    time: Optional[str] = None
    timestamp: Optional[str] = None
    location: Optional[str] = None
    suggestion: Optional[str] = None
    priority: str = "normal"
    subtasks: Optional[List[str]] = None


class AIParseResult(BaseModel):
    tasks: List[TaskItem] = Field(default_factory=list)
    summary: Optional[str] = None


class ProcessAudioResponse(BaseModel):
    success: bool
    raw_text: str
    ai_result: Optional[AIParseResult] = None
    record_id: Optional[int] = None
    error: Optional[str] = None
