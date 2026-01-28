from fastapi import APIRouter, HTTPException, Depends, status
from datetime import datetime, timedelta, date
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import OperationalError
import asyncio
import json

from auth import get_current_user_required
from database import get_db, get_redis, DATABASE_URL
from models import User
from schemas.pomodoro import PomodoroEndRequest, PomodoroStatsResponse, PomodoroSeries, PomodoroSummary, PomodoroEndResponse

router = APIRouter(prefix="/pomodoro", tags=["番茄钟"])

# ==================== 核心算法 (Pure Functions) ====================

def compute_local_date_hour(req: PomodoroEndRequest) -> tuple[str, int]:
    """计算本地日期和小时"""
    if req.local_date is not None and req.local_hour is not None:
        return req.local_date, req.local_hour
    
    if req.end_at and req.tz_offset_minutes is not None:
        # UTC time + offset = local time
        # Note: tz_offset_minutes usually means "minutes to add to UTC to get local" 
        # OR "minutes west of UTC"? Typically frontend sends: local = utc + offset
        # Standard: JS getTimezoneOffset() returns (UTC - Local). So Local = UTC - offset.
        # But req says "tz_offset_minutes" (could be whatever). 
        # Convention in our spec: 
        # If frontend sends 480 (UTC+8), we assume we add it.
        # Let's assume positive means East (add).
        local_dt = req.end_at + timedelta(minutes=req.tz_offset_minutes)
        return local_dt.strftime("%Y-%m-%d"), local_dt.hour
        
    # Should be caught by validation, but fallback to UTC
    now = datetime.utcnow()
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
        return # Skip pruning on bad date reference

    min_date = today - timedelta(days=keep_days - 1)
    
    keys_to_remove = []
    for date_str in days_map:
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
            if d < min_date:
                keys_to_remove.append(date_str)
        except ValueError:
            # Bad format key, maybe safe to remove or ignore? 
            # Strict mode: keep only valid dates >= min_date. 
            # Let's remove invalid keys to keep DB clean.
            keys_to_remove.append(date_str)
            
    for k in keys_to_remove:
        del days_map[k]

def compute_current_streak(days_map: dict, today_str: str) -> int:
    """
    计算当前连续天数。
    Streak Rule:
    - If today completed > 0: count from today backwards.
    - If today completed == 0: count from yesterday backwards.
    - Only 'c' > 0 counts (interrupted doesn't break streak but doesn't add to it? 
      Actually spec says "c>0" is completed. "interrupted doesn't count as completed".
      So streak breaks if a day has c=0.
    """
    streak = 0
    try:
        today = datetime.strptime(today_str, "%Y-%m-%d").date()
    except ValueError:
        return 0

    check_date = today
    # Strategy: 
    # If Today has activity, start checking from Today.
    # If Today has NO activity, start checking from Yesterday.
    # (So if I practiced yesterday but not yet today, streak is still alive)
    
    current_val = days_map.get(today_str, {})
    if not isinstance(current_val, dict) or current_val.get("c", 0) <= 0:
        check_date = today - timedelta(days=1)
    
    # Max backtrack 365 days (though we prune to 30, so effectively 30)
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
        return 9 # 默认 9 点
        
    # Find index of max value
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
    redis = Depends(get_redis)
):
    """提交番茄钟记录 (幂等 + 自动统计)"""
    
    # 1. Redis 幂等去重 (Strict Rule 6)
    if redis:
        dedup_key = f"pomodoro:dedup:{user.uid}:{req.session_id}"
        # TTL 35天，略大于存储周期
        is_new = await redis.set(dedup_key, "1", ex=35*24*3600, nx=True)
        if not is_new:
            # 已经处理过
             local_d, local_h = compute_local_date_hour(req)
             return PomodoroEndResponse(
                 ok=True, 
                 deduped=True, 
                 local_date=local_d, 
                 local_hour=local_h
             )
    else:
        # If Redis is down, we might want to fail safely or allow (with risk of dupes).
        # Requirement says "Use Redis for dedup".
        # We'll validly assume Redis is present.
        pass

    # 2. 计算本地时间
    local_date, local_hour = compute_local_date_hour(req)
    
    # 3. 数据库事务更新 (Strict locking)
    # MySQL: select ... for update
    # SQLite: rely on standard transaction locking (pessimistic not fully supported async same way, but single writer usually enforced by driver level locks or busy_timeout)
    
    is_mysql = "mysql" in DATABASE_URL
    
    try:
        stmt = select(User).where(User.id == user.id)
        if is_mysql:
            stmt = stmt.with_for_update()
            
        result = await db.execute(stmt)
        db_user = result.scalar_one()
        
        # 初始化 JSON 结构 (Handle potential None)
        # Note: accessing db_user.pomo_daily_json might trigger loading
        if db_user.pomo_daily_json is None:
            db_user.pomo_daily_json = {
                "keep_days": 30,
                "days": {}
            }
        
        # Ensure it's a dict (in case of weird DB state)
        if not isinstance(db_user.pomo_daily_json, dict):
             db_user.pomo_daily_json = {"keep_days":30, "days":{}}

        data = db_user.pomo_daily_json
        if "days" not in data:
            data["days"] = {}
        
        days = data["days"]
        
        # 初始化当天的记录
        if local_date not in days:
            days[local_date] = {
                "c": 0, "i": 0, "s": 0, 
                "h": [0] * 24
            }
        
        day = days[local_date]
        
        # 更新数据
        day["s"] = day.get("s", 0) + req.duration_sec
        if req.status == "completed":
            day["c"] = day.get("c", 0) + 1
        else:
            day["i"] = day.get("i", 0) + 1
            
        # 安全更新小时桶
        if 0 <= local_hour < 24:
            if "h" not in day or not isinstance(day["h"], list) or len(day["h"]) != 24:
                day["h"] = [0] * 24
            day["h"][local_hour] += 1
            
        # Strict Rule 5: 写入时裁剪历史
        prune_days(days, local_date, keep_days=30)
        
        # User Model Cumulative Fields
        db_user.pomo_total_focus_sec += req.duration_sec
        if req.status == "completed":
            db_user.pomo_total_completed += 1
        else:
            db_user.pomo_total_interrupted += 1
        db_user.pomo_updated_at = datetime.utcnow()
        
        # Explicitly flag modification if MutableDict doesn't catch it (Safety net)
        # With MutableDict + JSONEncodedDict, inline dict modification should be tracked.
        # But reassignment is safer.
        # db_user.pomo_daily_json = data # Re-assigning might trigger TypeDecorator process_bind_param
        
        await db.commit()
        
        return PomodoroEndResponse(
            ok=True, 
            deduped=False, 
            local_date=local_date, 
            local_hour=local_hour
        )

    except OperationalError as e:
        # Handle database locked errors (SQLite mainly)
        await db.rollback()
        raise HTTPException(status_code=503, detail="Database busy, please retry")
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=PomodoroStatsResponse)
async def pomodoro_stats(
    days: int = 30,
    compact: bool = False,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db) 
):
    """获取番茄钟统计趋势"""
    
    # Reload user to get latest stats
    result = await db.execute(select(User).where(User.id == user.id))
    db_user = result.scalar_one()
    
    data = db_user.pomo_daily_json or {"days": {}}
    if not isinstance(data, dict):
        data = {"days": {}}
        
    days_map = data.get("days", {})
    
    # Today's server date (or could be derived)
    today_str = datetime.utcnow().strftime("%Y-%m-%d") # Or pass from client? Spec implies dynamic calculation.
    
    # 1. Summary Calculation
    today_data = days_map.get(today_str, {})
    total_completed_30d = 0
    total_focus_sec_30d = 0
    total_interrupted_30d = 0
    
    for d_val in days_map.values():
        if isinstance(d_val, dict):
            total_completed_30d += d_val.get("c", 0)
            total_focus_sec_30d += d_val.get("s", 0)
            # interupted field might be 'i'
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
        peak_hour=peak
    )
    
    # 2. Series Generation (Zero Filling)
    series_dates = []
    series_c = []
    series_s = []
    series_i = []
    
    current_date_obj = datetime.strptime(today_str, "%Y-%m-%d").date()
    
    # Generate list of dates from Past -> Today
    date_list = []
    for i in range(days):
        # i=0 (today), i=29 (29 days ago)
        d = current_date_obj - timedelta(days=i)
        date_list.append(d.strftime("%Y-%m-%d"))
    date_list.reverse() # Result: [Oldest, ..., Today]
    
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
        interrupted=series_i
    )
    
    # Raw Data: If compact, minimal or None? 
    # Spec says: raw (only when compact=false): returns days map
    raw_response = None
    if not compact:
        raw_response = days_map
        
    return PomodoroStatsResponse(
        summary=summary,
        series=series,
        raw=raw_response
    )
