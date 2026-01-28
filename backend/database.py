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

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select, func, text

from models import Base, User, Record, SystemConfig, DeviceUsage


# ==================== 数据库连接配置 ====================

def get_database_url() -> str:
    """获取数据库连接 URL，支持环境变量覆盖"""
    # 优先读取环境变量
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        # 处理 MySQL URL 格式
        if database_url.startswith("mysql://"):
            database_url = database_url.replace("mysql://", "mysql+aiomysql://", 1)
        return database_url
    
    # 默认使用 SQLite
    db_path = Path(__file__).parent / "flow.db"
    return f"sqlite+aiosqlite:///{db_path}"


# 创建异步引擎
DATABASE_URL = get_database_url()
engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("DEBUG", "false").lower() == "true",  # 仅调试时打印 SQL
    pool_pre_ping=True,  # 自动检测断开的连接
)

# 创建会话工厂
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ==================== Redis 连接配置 ====================
import redis.asyncio as redis

redis_client = None

async def init_redis():
    """初始化 Redis 连接"""
    global redis_client
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    try:
        redis_client = redis.from_url(redis_url, decode_responses=True)
        await redis_client.ping()
        print(f"✅ Redis 连接成功: {redis_url}")
    except Exception as e:
        print(f"⚠️ Redis 连接失败: {e}")
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
    await init_redis()  # 初始化 Redis
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_user_columns(conn)
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
            "pomo_daily_json": "TEXT", # SQLite uses TEXT for JSON
            "pomo_total_completed": "INTEGER DEFAULT 0",
            "pomo_total_interrupted": "INTEGER DEFAULT 0",
            "pomo_total_focus_sec": "INTEGER DEFAULT 0",
            "pomo_updated_at": "DATETIME",
        }
        for name, ddl in columns.items():
            if name not in existing:
                await conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {ddl}"))
    else:
        # MySQL / MariaDB
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
            "pomo_daily_json": "JSON", # MySQL uses JSON type
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
    user_token: str = "",
    device_id: Optional[str] = None
) -> User:
    """创建新用户"""
    async with async_session_maker() as session:
        uid = await get_next_uid()
        
        # 为了满足 user_token 的 unique 约束，先生成一个临时的唯一值
        import uuid
        if not user_token:
            user_token = f"temp_{uuid.uuid4().hex}"

        user = User(
            uid=uid,
            username=username,
            nickname=nickname or username,
            password_hash=password_hash,
            avatar_url=avatar_url,
            user_token=user_token,
            last_device_id=device_id
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


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


async def update_user_token(user_id: int, token: str):
    """更新用户 Token"""
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


async def update_user_usage(user_id: int):
    """更新用户今日使用次数"""
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
        
        # VIP 用户无限制
        if user.tier == "vip":
            return True, -1  # -1 表示无限
        
        # 读取配置
        config_path = Path(__file__).parent / "config.json"
        limit = 10
        try:
            if config_path.exists():
                with open(config_path, "r", encoding="utf-8") as f:
                    config = json.load(f)
                    limit = config.get("limits", {}).get("free_daily_limit", 10)
        except Exception:
            pass  # 保持默认值 10

        # Free 用户每日限制
        today = datetime.now().strftime("%Y-%m-%d")
        if user.last_usage_date != today:
            return True, limit  # 新的一天，重置
        
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
    is_vip_model: bool = False
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
    """获取或创建未登录设备使用记录"""
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
        await session.commit()
        await session.refresh(usage)
        return usage


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
