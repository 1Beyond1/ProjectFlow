from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


MIN_LOCAL_DATE = date(2020, 1, 1)


class PomodoroEndRequest(BaseModel):
    """番茄钟结束请求"""
    session_id: str = Field(..., min_length=1, max_length=128, description="客户端生成的唯一会话ID")
    duration_sec: int = Field(..., gt=0, le=86400, description="专注时长(秒，1~86400)")
    status: str = Field(..., pattern=r"^(completed|interrupted)$", description="状态")

    # 方式1: 客户端传 local_date/hour
    local_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    local_hour: Optional[int] = Field(None, ge=0, le=23)

    # 方式2: 客户端传 end_at + offset（东区为正，如 UTC+8 传 480）
    end_at: Optional[datetime] = None
    tz_offset_minutes: Optional[int] = Field(None, ge=-720, le=840)

    @field_validator("local_date")
    @classmethod
    def validate_local_date(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        try:
            parsed = datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValueError("无效的日期") from exc

        max_date = datetime.now(timezone.utc).date() + timedelta(days=2)
        if parsed < MIN_LOCAL_DATE or parsed > max_date:
            raise ValueError("日期超出允许范围")
        return value

    @model_validator(mode="after")
    def validate_end_at_range(self):
        if self.end_at is not None:
            base_utc = (
                self.end_at.astimezone(timezone.utc)
                if self.end_at.tzinfo is not None
                else self.end_at.replace(tzinfo=timezone.utc)
            )
            offset_min = self.tz_offset_minutes or 0
            local_date = (base_utc + timedelta(minutes=offset_min)).date()
            max_date = datetime.now(timezone.utc).date() + timedelta(days=2)
            if local_date < MIN_LOCAL_DATE or local_date > max_date:
                raise ValueError("结束时间超出允许范围")
        return self


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
