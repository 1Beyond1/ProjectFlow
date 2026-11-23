from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from auth import get_current_user_required
from database import DATABASE_URL, get_db, get_redis
from models import User
from schemas.pomodoro import (
    PomodoroEndRequest,
    PomodoroEndResponse,
    PomodoroSeries,
    PomodoroStatsResponse,
    PomodoroSummary,
)

router = APIRouter(prefix="/pomodoro", tags=["番茄钟"])


# ==================== 核心算法 (Pure Functions) ====================

def compute_local_date_hour(req: PomodoroEndRequest) -> tuple[str, int]:
    """计算本地日期和小时（约定 tz_offset_minutes 东区为正，如 UTC+8 为 +480）"""
    if req.local_date is not None and req.local_hour is not None:
        return req.local_date, req.local_hour

    if req.end_at and req.tz_offset_minutes is not None:
        base_utc = (
            req.end_at.astimezone(timezone.utc)
            if req.end_at.tzinfo is not None
            else req.end_at.replace(tzinfo=timezone.utc)
        )
        local_dt = base_utc + timedelta(minutes=req.tz_offset_minutes)
        return local_dt.strftime("%Y-%m-%d"), local_dt.hour

    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%d"), now.hour


def prune_days(days_map: dict, today_str: str, keep_days: int = 30):
    """
    裁剪历史，只保留最近 keep_days 天 (包含 today)。
    Strict Rule:
    - min_date = today - (keep_days - 1)
    - Delete ANY key < min_date
    """
    try:
        today = datetime.strptime(today_str, "%Y-%m-%d").date()
    except ValueError:
        return

    min_date = today - timedelta(days=keep_days - 1)

    keys_to_remove = []
    for date_str in days_map:
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
            if d < min_date:
                keys_to_remove.append(date_str)
        except ValueError:
            keys_to_remove.append(date_str)

    for k in keys_to_remove:
        del days_map[k]


def compute_current_streak(days_map: dict, today_str: str) -> int:
    """计算当前连续天数（仅 c > 0 计入连续天数）"""
    streak = 0
    try:
        today = datetime.strptime(today_str, "%Y-%m-%d").date()
    except ValueError:
        return 0

    check_date = today
    current_val = days_map.get(today_str, {})
    if not isinstance(current_val, dict) or current_val.get("c", 0) <= 0:
        check_date = today - timedelta(days=1)

    for _ in range(60):
        d_str = check_date.strftime("%Y-%m-%d")
        day_val = days_map.get(d_str)

        if day_val and isinstance(day_val, dict) and day_val.get("c", 0) > 0:
            streak += 1
            check_date -= timedelta(days=1)
        else:
            break

    return streak


def compute_peak_hour(days_map: dict) -> int:
    """计算 30 天内的高峰小时 (sum of 'h' buckets)"""
    hour_counts = [0] * 24
    for day_data in days_map.values():
        if not isinstance(day_data, dict):
            continue
        hours = day_data.get("h", [])
        if not isinstance(hours, list) or len(hours) != 24:
            continue
        for i, count in enumerate(hours):
            if isinstance(count, int):
                hour_counts[i] += count

    if sum(hour_counts) == 0:
        return 9

    max_val = -1
    max_idx = 9
    for i in range(24):
        if hour_counts[i] > max_val:
            max_val = hour_counts[i]
            max_idx = i

    return max_idx


# ==================== 接口实现 ====================

@router.post("/end", response_model=PomodoroEndResponse)
async def pomodoro_end(
    req: PomodoroEndRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """提交番茄钟记录 (幂等 + 自动统计)"""
    dedup_key = f"pomodoro:dedup:{user.uid}:{req.session_id}"
    dedup_acquired = False

    # 1. Redis 幂等去重
    if redis:
        try:
            is_new = await redis.set(dedup_key, "1", ex=35 * 24 * 3600, nx=True)
            if not is_new:
                local_d, local_h = compute_local_date_hour(req)
                return PomodoroEndResponse(
                    ok=True,
                    deduped=True,
                    local_date=local_d,
                    local_hour=local_h,
                )
            dedup_acquired = True
        except Exception as e:
            print(f"⚠️ Redis 幂等写入失败，降级继续: {type(e).__name__}")

    # 2. 计算本地时间
    local_date, local_hour = compute_local_date_hour(req)

    # 3. 数据库事务更新
    is_mysql = "mysql" in DATABASE_URL

    try:
        stmt = select(User).where(User.id == user.id)
        if is_mysql:
            stmt = stmt.with_for_update()

        result = await db.execute(stmt)
        db_user = result.scalar_one()

        if db_user.pomo_daily_json is None or not isinstance(db_user.pomo_daily_json, dict):
            db_user.pomo_daily_json = {
                "keep_days": 30,
                "days": {},
            }

        data = db_user.pomo_daily_json
        if "days" not in data or not isinstance(data["days"], dict):
            data["days"] = {}

        days = data["days"]

        if local_date not in days or not isinstance(days[local_date], dict):
            days[local_date] = {
                "c": 0,
                "i": 0,
                "s": 0,
                "h": [0] * 24,
            }

        day = days[local_date]

        day["s"] = day.get("s", 0) + req.duration_sec
        if req.status == "completed":
            day["c"] = day.get("c", 0) + 1
        else:
            day["i"] = day.get("i", 0) + 1

        if 0 <= local_hour < 24:
            if "h" not in day or not isinstance(day["h"], list) or len(day["h"]) != 24:
                day["h"] = [0] * 24
            day["h"][local_hour] += 1

        prune_days(days, local_date, keep_days=30)

        db_user.pomo_total_focus_sec = (db_user.pomo_total_focus_sec or 0) + req.duration_sec
        if req.status == "completed":
            db_user.pomo_total_completed = (db_user.pomo_total_completed or 0) + 1
        else:
            db_user.pomo_total_interrupted = (db_user.pomo_total_interrupted or 0) + 1
        db_user.pomo_updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

        # 嵌套字典修改必须显式标记脏状态，否则 MutableDict 不会触发持久化
        flag_modified(db_user, "pomo_daily_json")

        await db.commit()

        return PomodoroEndResponse(
            ok=True,
            deduped=False,
            local_date=local_date,
            local_hour=local_hour,
        )

    except OperationalError:
        await db.rollback()
        if redis and dedup_acquired:
            try:
                await redis.delete(dedup_key)
            except Exception:
                pass
        raise HTTPException(status_code=503, detail="Database busy, please retry")
    except Exception as e:
        await db.rollback()
        if redis and dedup_acquired:
            try:
                await redis.delete(dedup_key)
            except Exception:
                pass
        print(f"❌ 番茄钟提交失败: {type(e).__name__}")
        raise HTTPException(status_code=500, detail="番茄钟记录保存失败，请稍后重试")


@router.get("/stats", response_model=PomodoroStatsResponse)
async def pomodoro_stats(
    days: int = Query(30, ge=1, le=90),
    compact: bool = False,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db),
):
    """获取番茄钟统计趋势"""
    result = await db.execute(select(User).where(User.id == user.id))
    db_user = result.scalar_one()

    data = db_user.pomo_daily_json or {"days": {}}
    if not isinstance(data, dict):
        data = {"days": {}}

    days_map = data.get("days", {})
    if not isinstance(days_map, dict):
        days_map = {}

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    today_data = days_map.get(today_str, {})
    total_completed_30d = 0
    total_focus_sec_30d = 0
    total_interrupted_30d = 0

    for d_val in days_map.values():
        if isinstance(d_val, dict):
            total_completed_30d += d_val.get("c", 0)
            total_focus_sec_30d += d_val.get("s", 0)
            total_interrupted_30d += d_val.get("i", 0)

    total_sessions = total_completed_30d + total_interrupted_30d
    completion_rate = 1.0
    if total_sessions > 0:
        completion_rate = float(total_completed_30d) / total_sessions

    streak = compute_current_streak(days_map, today_str)
    peak = compute_peak_hour(days_map)

    summary = PomodoroSummary(
        today_date=today_str,
        today_completed=today_data.get("c", 0) if isinstance(today_data, dict) else 0,
        today_focus_sec=today_data.get("s", 0) if isinstance(today_data, dict) else 0,
        total_completed_30d=total_completed_30d,
        total_focus_sec_30d=total_focus_sec_30d,
        completion_rate_30d=round(completion_rate, 2),
        current_streak=streak,
        peak_hour=peak,
    )

    series_dates = []
    series_c = []
    series_s = []
    series_i = []

    current_date_obj = datetime.strptime(today_str, "%Y-%m-%d").date()
    date_list = [
        (current_date_obj - timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(days)
    ]
    date_list.reverse()

    for d_str in date_list:
        series_dates.append(d_str)
        val = days_map.get(d_str)
        if val and isinstance(val, dict):
            series_c.append(val.get("c", 0))
            series_s.append(val.get("s", 0))
            series_i.append(val.get("i", 0))
        else:
            series_c.append(0)
            series_s.append(0)
            series_i.append(0)

    series = PomodoroSeries(
        dates=series_dates,
        completed=series_c,
        focus_sec=series_s,
        interrupted=series_i,
    )

    raw_response = None if compact else days_map

    return PomodoroStatsResponse(
        summary=summary,
        series=series,
        raw=raw_response,
    )
