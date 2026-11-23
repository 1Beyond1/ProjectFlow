"""
数据库连接与会话管理
支持 SQLite (本地开发) 和 MySQL (生产环境) 双模切换

环境变量控制:
- DATABASE_URL: 完整数据库连接字符串 (优先)
- 默认: sqlite+aiosqlite:///./flow.db
"""
import os
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, AsyncGenerator

import redis.asyncio as redis
from sqlalchemy import select, func, text, update, or_, case
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from models import Base, User, Record, SystemConfig, DeviceUsage
from security import mask_url_password


# ==================== 数据库连接配置 ====================

def get_database_url() -> str:
    """获取数据库连接 URL，支持环境变量覆盖"""
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        if database_url.startswith("mysql://"):
            database_url = database_url.replace("mysql://", "mysql+aiomysql://", 1)
        return database_url

    db_path = Path(__file__).parent / "flow.db"
    return f"sqlite+aiosqlite:///{db_path}"


def _build_engine(database_url: str):
    kwargs = {
        "echo": os.getenv("DEBUG", "false").lower() == "true",
        "pool_pre_ping": True,
    }
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"timeout": 30}
    return create_async_engine(database_url, **kwargs)


DATABASE_URL = get_database_url()
engine = _build_engine(DATABASE_URL)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ==================== Redis 连接配置 ====================

redis_client = None


async def init_redis():
    """初始化 Redis 连接"""
    global redis_client
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    masked_url = mask_url_password(redis_url)
    try:
        redis_client = redis.from_url(redis_url, decode_responses=True)
        await redis_client.ping()
        print(f"✅ Redis 连接成功: {masked_url}")
    except Exception as e:
        print(f"⚠️ Redis 连接失败 ({masked_url}): {type(e).__name__}")
        redis_client = None


async def get_redis():
    """获取 Redis 客户端"""
    global redis_client
    if redis_client is None:
        await init_redis()
    return redis_client


# ==================== 数据库生命周期 ====================

async def init_db():
    """初始化数据库表结构"""
    await init_redis()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_user_columns(conn)
        await _ensure_device_usage_unique_index(conn)
    print(f"✅ 数据库初始化完成: {DATABASE_URL.split('://')[0]}")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """获取数据库会话 (依赖注入用)"""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def _ensure_user_columns(conn):
    """为旧数据库补充新字段"""
    if DATABASE_URL.startswith("sqlite"):
        result = await conn.execute(text("PRAGMA table_info(users)"))
        existing = {row[1] for row in result.fetchall()}
        columns = {
            "text_daily_usage": "INTEGER DEFAULT 0",
            "vip_daily_usage": "INTEGER DEFAULT 0",
            "vision_daily_usage": "INTEGER DEFAULT 0",
            "is_banned": "INTEGER DEFAULT 0",
            "last_device_id": "VARCHAR(100)",
            "pomo_daily_json": "TEXT",
            "pomo_total_completed": "INTEGER DEFAULT 0",
            "pomo_total_interrupted": "INTEGER DEFAULT 0",
            "pomo_total_focus_sec": "INTEGER DEFAULT 0",
            "pomo_updated_at": "DATETIME",
        }
        for name, ddl in columns.items():
            if name not in existing:
                await conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {ddl}"))
    else:
        try:
            result = await conn.execute(text("SHOW COLUMNS FROM users"))
            existing = {row[0] for row in result.fetchall()}
        except Exception:
            existing = set()
        columns = {
            "text_daily_usage": "INTEGER DEFAULT 0",
            "vip_daily_usage": "INTEGER DEFAULT 0",
            "vision_daily_usage": "INTEGER DEFAULT 0",
            "is_banned": "INTEGER DEFAULT 0",
            "last_device_id": "VARCHAR(100)",
            "pomo_daily_json": "JSON",
            "pomo_total_completed": "INTEGER DEFAULT 0",
            "pomo_total_interrupted": "INTEGER DEFAULT 0",
            "pomo_total_focus_sec": "INTEGER DEFAULT 0",
            "pomo_updated_at": "DATETIME",
        }
        for name, ddl in columns.items():
            if name not in existing:
                try:
                    await conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {ddl}"))
                except Exception:
                    pass


async def _ensure_device_usage_unique_index(conn):
    """确保 device_usage 存在 (device_id, usage_date) 唯一索引"""
    if DATABASE_URL.startswith("sqlite"):
        try:
            await conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_device_usage_date "
                    "ON device_usage (device_id, usage_date)"
                )
            )
        except Exception:
            pass


# ==================== 用户相关操作 ====================

async def get_next_uid() -> int:
    """获取下一个可用的 UID (从 10000 开始)"""
    async with async_session_maker() as session:
        result = await session.execute(select(func.max(User.uid)))
        max_uid = result.scalar()
        return (max_uid or 9999) + 1


async def create_user(
    username: str,
    password_hash: str,
    nickname: Optional[str] = None,
    avatar_url: Optional[str] = None,
    user_token: Optional[str] = None,
    device_id: Optional[str] = None,
    max_retries: int = 5,
) -> User:
    """创建新用户（支持并发 UID 冲突重试）"""
    last_error: Optional[Exception] = None
    for _ in range(max_retries):
        async with async_session_maker() as session:
            try:
                result = await session.execute(select(func.max(User.uid)))
                max_uid = result.scalar()
                uid = (max_uid or 9999) + 1

                user = User(
                    uid=uid,
                    username=username,
                    nickname=nickname or username,
                    password_hash=password_hash,
                    avatar_url=avatar_url,
                    user_token=user_token or None,
                    last_device_id=device_id,
                )
                session.add(user)
                await session.commit()
                await session.refresh(user)
                return user
            except IntegrityError as exc:
                await session.rollback()
                last_error = exc
                existing = await get_user_by_username(username)
                if existing is not None:
                    raise
    if last_error is not None:
        raise last_error
    raise RuntimeError("创建用户失败：UID 分配重试超限")


async def get_user_by_username(username: str) -> Optional[User]:
    """通过用户名查找用户"""
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()


async def get_user_by_uid(uid: int) -> Optional[User]:
    """通过 UID 查找用户"""
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.uid == uid))
        return result.scalar_one_or_none()


async def get_user_by_id(user_id: int) -> Optional[User]:
    """通过 ID 查找用户"""
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()


async def update_user_token(user_id: int, token: Optional[str]):
    """更新或清空用户 Refresh Token 哈希"""
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            user.user_token = token
            await session.commit()


async def update_user_device_id(user_id: int, device_id: str):
    """更新用户最后登录设备 ID"""
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            user.last_device_id = device_id
            await session.commit()


def _read_free_daily_limit() -> int:
    config_path = Path(__file__).parent / "config.json"
    limit = 10
    try:
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8-sig") as f:
                config = json.load(f)
                limit = int(config.get("limits", {}).get("free_daily_limit", 10))
    except Exception:
        pass
    return limit


async def reserve_user_quota(
    user_id: int,
    usage_type: str,
    is_vip_model: bool = False,
    free_daily_limit: Optional[int] = None,
) -> tuple[bool, int]:
    """
    原子预扣已登录用户每日配额，防止高并发穿透。
    返回 (是否成功预扣, 剩余次数；VIP 文字配额返回 -1)
    """
    today = datetime.now().strftime("%Y-%m-%d")
    limit_free = free_daily_limit if free_daily_limit is not None else _read_free_daily_limit()

    async with async_session_maker() as session:
        async with session.begin():
            # 1. 跨天重置（单语句原子执行）
            await session.execute(
                update(User)
                .where(
                    User.id == user_id,
                    or_(User.last_usage_date.is_(None), User.last_usage_date != today),
                )
                .values(
                    last_usage_date=today,
                    daily_usage=0,
                    text_daily_usage=0,
                    vip_daily_usage=0,
                    vision_daily_usage=0,
                )
            )

            # 2. 获取用户等级
            tier_res = await session.execute(select(User.tier).where(User.id == user_id))
            tier_val = tier_res.scalar_one_or_none()
            if tier_val is None:
                return False, 0
            tier_str = tier_val.value if hasattr(tier_val, "value") else str(tier_val).lower()

            # 3. 条件更新实现原子扣减
            if usage_type == "text":
                if tier_str == "vip":
                    values = {
                        "daily_usage": User.daily_usage + 1,
                        "text_daily_usage": User.text_daily_usage + 1,
                    }
                    if is_vip_model:
                        values["vip_daily_usage"] = User.vip_daily_usage + 1
                    res = await session.execute(
                        update(User).where(User.id == user_id).values(**values)
                    )
                    return res.rowcount == 1, -1

                res = await session.execute(
                    update(User)
                    .where(
                        User.id == user_id,
                        User.last_usage_date == today,
                        User.daily_usage < limit_free,
                        User.text_daily_usage < limit_free,
                    )
                    .values(
                        daily_usage=User.daily_usage + 1,
                        text_daily_usage=User.text_daily_usage + 1,
                    )
                )
                if res.rowcount != 1:
                    return False, 0
                used_res = await session.execute(select(User.text_daily_usage).where(User.id == user_id))
                used = used_res.scalar_one_or_none() or 0
                return True, max(0, limit_free - used)

            if usage_type == "vision":
                vision_limit = 10 if tier_str == "vip" else 1
                res = await session.execute(
                    update(User)
                    .where(
                        User.id == user_id,
                        User.last_usage_date == today,
                        User.vision_daily_usage < vision_limit,
                    )
                    .values(vision_daily_usage=User.vision_daily_usage + 1)
                )
                if res.rowcount != 1:
                    return False, 0
                used_res = await session.execute(select(User.vision_daily_usage).where(User.id == user_id))
                used = used_res.scalar_one_or_none() or 0
                return True, max(0, vision_limit - used)

            raise ValueError(f"Unsupported usage_type: {usage_type}")


async def refund_user_quota(
    user_id: int,
    usage_type: str,
    is_vip_model: bool = False,
):
    """当上游模型调用失败时回滚已预扣的用户配额"""
    today = datetime.now().strftime("%Y-%m-%d")
    async with async_session_maker() as session:
        async with session.begin():
            if usage_type == "text":
                values = {
                    "daily_usage": case((User.daily_usage > 0, User.daily_usage - 1), else_=0),
                    "text_daily_usage": case((User.text_daily_usage > 0, User.text_daily_usage - 1), else_=0),
                }
                if is_vip_model:
                    values["vip_daily_usage"] = case(
                        (User.vip_daily_usage > 0, User.vip_daily_usage - 1),
                        else_=0,
                    )
                await session.execute(
                    update(User)
                    .where(User.id == user_id, User.last_usage_date == today)
                    .values(**values)
                )
            elif usage_type == "vision":
                await session.execute(
                    update(User)
                    .where(User.id == user_id, User.last_usage_date == today)
                    .values(
                        vision_daily_usage=case(
                            (User.vision_daily_usage > 0, User.vision_daily_usage - 1),
                            else_=0,
                        )
                    )
                )


async def update_user_usage(user_id: int):
    """兼容旧调用：更新用户今日使用次数"""
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            today = datetime.now().strftime("%Y-%m-%d")
            if user.last_usage_date != today:
                user.daily_usage = 1
                user.last_usage_date = today
                user.text_daily_usage = 0
                user.vip_daily_usage = 0
                user.vision_daily_usage = 0
            else:
                user.daily_usage += 1
            await session.commit()


async def check_user_limit(user_id: int) -> tuple[bool, int]:
    """检查用户是否超出限额，返回 (是否允许, 剩余次数)"""
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            return False, 0

        tier_str = user.tier.value if hasattr(user.tier, "value") else str(user.tier).lower()
        if tier_str == "vip":
            return True, -1

        limit = _read_free_daily_limit()
        today = datetime.now().strftime("%Y-%m-%d")
        if user.last_usage_date != today:
            return True, limit

        remaining = max(0, limit - user.daily_usage)
        return remaining > 0, remaining


async def reset_user_usage_if_new_day(user: User) -> User:
    """新的一天重置用户使用次数"""
    today = datetime.now().strftime("%Y-%m-%d")
    if user.last_usage_date != today:
        user.last_usage_date = today
        user.daily_usage = 0
        user.text_daily_usage = 0
        user.vip_daily_usage = 0
        user.vision_daily_usage = 0
    return user


async def increment_user_usage(
    user_id: int,
    usage_type: str,
    is_vip_model: bool = False,
) -> User:
    """记录用户使用次数"""
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError("User not found")

        user = await reset_user_usage_if_new_day(user)

        if usage_type == "text":
            user.text_daily_usage += 1
        elif usage_type == "vision":
            user.vision_daily_usage += 1

        if is_vip_model:
            user.vip_daily_usage += 1

        await session.commit()
        await session.refresh(user)
        return user


async def get_device_usage(device_id: str, usage_date: Optional[str] = None) -> DeviceUsage:
    """获取或创建未登录设备使用记录（处理并发插入唯一约束冲突）"""
    if not usage_date:
        usage_date = datetime.now().strftime("%Y-%m-%d")
    async with async_session_maker() as session:
        result = await session.execute(
            select(DeviceUsage).where(
                DeviceUsage.device_id == device_id,
                DeviceUsage.usage_date == usage_date,
            )
        )
        usage = result.scalar_one_or_none()
        if usage:
            return usage

        usage = DeviceUsage(
            device_id=device_id,
            usage_date=usage_date,
            text_count=0,
            stt_count=0,
            vision_count=0,
        )
        session.add(usage)
        try:
            await session.commit()
            await session.refresh(usage)
            return usage
        except IntegrityError:
            await session.rollback()
            result = await session.execute(
                select(DeviceUsage).where(
                    DeviceUsage.device_id == device_id,
                    DeviceUsage.usage_date == usage_date,
                )
            )
            existing = result.scalar_one_or_none()
            if existing is not None:
                return existing
            raise


async def reserve_device_quota(device_id: str, usage_type: str, limit: int) -> bool:
    """原子预扣游客设备每日配额"""
    today = datetime.now().strftime("%Y-%m-%d")
    await get_device_usage(device_id, today)

    col_map = {
        "text": DeviceUsage.text_count,
        "stt": DeviceUsage.stt_count,
        "vision": DeviceUsage.vision_count,
    }
    if usage_type not in col_map:
        raise ValueError(f"Unsupported usage_type: {usage_type}")

    col = col_map[usage_type]
    async with async_session_maker() as session:
        async with session.begin():
            res = await session.execute(
                update(DeviceUsage)
                .where(
                    DeviceUsage.device_id == device_id,
                    DeviceUsage.usage_date == today,
                    col < limit,
                )
                .values(**{col.key: col + 1})
            )
            return res.rowcount == 1


async def refund_device_quota(device_id: str, usage_type: str):
    """上游调用失败时回滚已预扣的游客设备配额"""
    today = datetime.now().strftime("%Y-%m-%d")
    col_map = {
        "text": DeviceUsage.text_count,
        "stt": DeviceUsage.stt_count,
        "vision": DeviceUsage.vision_count,
    }
    if usage_type not in col_map:
        return
    col = col_map[usage_type]
    async with async_session_maker() as session:
        async with session.begin():
            await session.execute(
                update(DeviceUsage)
                .where(
                    DeviceUsage.device_id == device_id,
                    DeviceUsage.usage_date == today,
                )
                .values(**{col.key: case((col > 0, col - 1), else_=0)})
            )


async def increment_device_usage(device_id: str, usage_type: str) -> DeviceUsage:
    """更新设备使用次数"""
    usage = await get_device_usage(device_id)
    async with async_session_maker() as session:
        result = await session.execute(select(DeviceUsage).where(DeviceUsage.id == usage.id))
        usage = result.scalar_one_or_none()
        if not usage:
            return usage
        if usage_type == "text":
            usage.text_count += 1
        elif usage_type == "stt":
            usage.stt_count += 1
        elif usage_type == "vision":
            usage.vision_count += 1
        await session.commit()
        await session.refresh(usage)
        return usage


async def get_banned_user_ids() -> list[int]:
    """获取被封禁的用户 ID"""
    async with async_session_maker() as session:
        result = await session.execute(select(User.id).where(User.is_banned == 1))
        return [row[0] for row in result.all()]


# ==================== 记录相关操作 ====================

async def create_record(raw_text: str, ai_json: str, device_id: str, user_id: Optional[int] = None) -> Record:
    """创建交互记录"""
    async with async_session_maker() as session:
        record = Record(
            raw_text=raw_text,
            ai_json=ai_json,
            device_id=device_id,
            user_id=user_id,
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)
        return record


async def get_records_by_user(user_id: int, limit: int = 50) -> list[Record]:
    """仅获取指定用户的交互记录（强制数据隔离）"""
    async with async_session_maker() as session:
        result = await session.execute(
            select(Record)
            .where(Record.user_id == user_id)
            .order_by(Record.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())


async def get_records_by_device(device_id: str, limit: int = 100) -> list[Record]:
    """获取设备的交互记录"""
    async with async_session_maker() as session:
        result = await session.execute(
            select(Record)
            .where(Record.device_id == device_id)
            .order_by(Record.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())


async def get_all_records(limit: int = 100) -> list[Record]:
    """获取所有交互记录"""
    async with async_session_maker() as session:
        result = await session.execute(
            select(Record)
            .order_by(Record.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
