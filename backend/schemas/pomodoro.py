from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime

class PomodoroEndRequest(BaseModel):
    """番茄钟结束请求"""
    session_id: str = Field(..., description="客户端生成的唯一会话ID")
    duration_sec: int = Field(..., gt=0, description="专注时长(秒)")
    status: str = Field(..., pattern="^(completed|interrupted)$", description="状态")
    
    # 方式1: 客户端传 local_date/hour
    local_date: Optional[str] = Field(None, pattern="^\d{4}-\d{2}-\d{2}$")
    local_hour: Optional[int] = Field(None, ge=0, le=23)
    
    # 方式2: 客户端传 end_at + offset
    end_at: Optional[datetime] = None
    tz_offset_minutes: Optional[int] = None

class PomodoroSummary(BaseModel):
    today_date: str
    today_completed: int
    today_focus_sec: int
    total_completed_30d: int
    total_focus_sec_30d: int
    completion_rate_30d: float
    current_streak: int
    peak_hour: int

class PomodoroSeries(BaseModel):
    dates: List[str]
    completed: List[int]
    focus_sec: List[int]
    interrupted: List[int]

class PomodoroStatsResponse(BaseModel):
    summary: PomodoroSummary
    series: PomodoroSeries
    raw: Optional[Dict] = None

class PomodoroEndResponse(BaseModel):
    ok: bool
    deduped: bool
    local_date: str
    local_hour: int
