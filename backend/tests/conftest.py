import asyncio
import json
import sys
from pathlib import Path

import httpx
import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

_REAL_HTTPX_ASYNC_CLIENT = httpx.AsyncClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import auth as auth_module
import database as database_module
import main as main_module
from models import Base, User, UserTier
from routers import pomodoro as pomodoro_router


TEST_JWT_SECRET = "TestJwtSecretKey_MustBeAtLeast32CharsLong_2026!"
TEST_SERVER_API_KEY = "sk-server-super-secret-do-not-leak-1234567890"


class FakeRedis:
    """轻量内存异步 Redis 替身，支持测试原子 RENAME 与幂等去重"""

    def __init__(self):
        self.kv: dict[str, str] = {}
        self.sets: dict[str, set[str]] = {}
        self.ops: list[tuple] = []

    async def ping(self):
        self.ops.append(("ping",))
        return True

    async def set(self, key: str, value: str, ex: int | None = None, nx: bool = False):
        self.ops.append(("set", key, nx))
        if nx and key in self.kv:
            return False
        self.kv[key] = value
        return True

    async def delete(self, *keys: str):
        self.ops.append(("delete", *keys))
        removed = 0
        for key in keys:
            if key in self.kv:
                del self.kv[key]
                removed += 1
            if key in self.sets:
                del self.sets[key]
                removed += 1
        return removed

    async def sadd(self, key: str, *members: str):
        self.ops.append(("sadd", key, tuple(members)))
        bucket = self.sets.setdefault(key, set())
        before = len(bucket)
        for m in members:
            bucket.add(str(m))
        return len(bucket) - before

    async def sismember(self, key: str, member: str) -> bool:
        self.ops.append(("sismember", key, str(member)))
        return str(member) in self.sets.get(key, set())

    async def rename(self, src: str, dst: str):
        self.ops.append(("rename", src, dst))
        if src in self.sets:
            self.sets[dst] = set(self.sets.pop(src))
            return True
        if src in self.kv:
            self.kv[dst] = self.kv.pop(src)
            return True
        raise KeyError(src)

    async def aclose(self):
        self.ops.append(("aclose",))


class FailingRedis:
    """模拟 Redis 故障/断连场景"""

    async def ping(self):
        raise ConnectionError("Redis unavailable")

    async def set(self, *args, **kwargs):
        raise ConnectionError("Redis unavailable")

    async def delete(self, *args, **kwargs):
        raise ConnectionError("Redis unavailable")

    async def sadd(self, *args, **kwargs):
        raise ConnectionError("Redis unavailable")

    async def sismember(self, *args, **kwargs):
        raise ConnectionError("Redis unavailable")

    async def rename(self, *args, **kwargs):
        raise ConnectionError("Redis unavailable")

    async def aclose(self):
        return None


def build_test_config(free_daily_limit: int = 2) -> dict:
    return {
        "vendors": {
            "SiliconFlow": {
                "base_url": "https://api.siliconflow.cn/v1",
                "api_key": TEST_SERVER_API_KEY,
            }
        },
        "defaults": {
            "free": {
                "llm": "Qwen/Qwen3-8B",
                "vision": "THUDM/GLM-4.1V-9B-Thinking",
                "stt": "FunAudioLLM/SenseVoiceSmall",
            },
            "vip": {
                "llm": "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
                "vision": "THUDM/GLM-4.1V-9B-Thinking",
                "stt": "FunAudioLLM/SenseVoiceSmall",
            },
        },
        "models": {
            "llm": [
                {
                    "id": "Qwen/Qwen3-8B",
                    "name": "Qwen3-8B",
                    "vendor": "SiliconFlow",
                    "tier": "free",
                    "is_default": True,
                },
                {
                    "id": "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
                    "name": "DeepSeek-R1",
                    "vendor": "SiliconFlow",
                    "tier": "vip",
                },
            ],
            "vision": [
                {
                    "id": "THUDM/GLM-4.1V-9B-Thinking",
                    "name": "GLM-4.1V",
                    "vendor": "SiliconFlow",
                    "tiers": ["free", "vip"],
                    "is_default": True,
                }
            ],
            "stt": [
                {
                    "id": "FunAudioLLM/SenseVoiceSmall",
                    "name": "SenseVoiceSmall",
                    "vendor": "SiliconFlow",
                    "tiers": ["free", "vip"],
                    "is_default": True,
                }
            ],
        },
        "jwt": {
            "secret_key": TEST_JWT_SECRET,
            "algorithm": "HS256",
            "access_token_expire_minutes": 60,
            "refresh_token_expire_days": 30,
        },
        "limits": {
            "free_daily_limit": free_daily_limit,
        },
    }


@pytest.fixture
def fake_redis():
    return FakeRedis()


@pytest.fixture
def isolated_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fake_redis: FakeRedis):
    """为每个测试提供隔离的 SQLite DB、config.json 与 FakeRedis"""
    db_file = tmp_path / "test_flow.db"
    db_url = f"sqlite+aiosqlite:///{db_file}"
    test_engine = database_module._build_engine(db_url)
    test_session_maker = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    monkeypatch.setattr(database_module, "DATABASE_URL", db_url)
    monkeypatch.setattr(database_module, "engine", test_engine)
    monkeypatch.setattr(database_module, "async_session_maker", test_session_maker)
    monkeypatch.setattr(database_module, "redis_client", fake_redis)
    monkeypatch.setattr(pomodoro_router, "DATABASE_URL", db_url)

    config_file = tmp_path / "config.json"
    config_file.write_text(json.dumps(build_test_config()), encoding="utf-8")
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    monkeypatch.setattr(auth_module, "CONFIG_PATH", config_file)
    auth_module.reset_config_cache()

    temp_audio_dir = tmp_path / "temp_audio"
    temp_audio_dir.mkdir()
    temp_image_dir = tmp_path / "temp_images"
    temp_image_dir.mkdir()
    monkeypatch.setattr(main_module, "TEMP_DIR", temp_audio_dir)
    monkeypatch.setattr(main_module, "TEMP_IMAGE_DIR", temp_image_dir)

    main_module.app.state.redis = fake_redis

    async def _override_get_redis():
        return main_module.app.state.redis

    main_module.app.dependency_overrides[database_module.get_redis] = _override_get_redis

    async def _setup():
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_setup())

    yield {
        "db_file": db_file,
        "engine": test_engine,
        "session_maker": test_session_maker,
        "config_file": config_file,
        "redis": fake_redis,
    }

    main_module.app.dependency_overrides.clear()
    auth_module.reset_config_cache()
    asyncio.run(test_engine.dispose())


async def register_user(client: httpx.AsyncClient, username: str, password: str = "Secret123!") -> dict:
    resp = await client.post(
        "/auth/register",
        json={
            "username": username,
            "password": password,
            "password_confirm": password,
            "nickname": username,
        },
        headers={"X-Device-ID": f"dev-{username}"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def set_user_banned(username: str, is_banned: int = 1):
    async with database_module.async_session_maker() as session:
        await session.execute(
            update(User).where(User.username == username).values(is_banned=is_banned)
        )
        await session.commit()


async def set_user_vip(username: str):
    async with database_module.async_session_maker() as session:
        await session.execute(
            update(User).where(User.username == username).values(tier=UserTier.VIP)
        )
        await session.commit()


def make_async_client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=main_module.app)
    return _REAL_HTTPX_ASYNC_CLIENT(transport=transport, base_url="http://testserver")
