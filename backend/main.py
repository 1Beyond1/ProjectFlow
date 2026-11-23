"""
Project Flow Backend - FastAPI 主应用

核心功能：
1. 安全的服务端托管配置与 BYOK 出站 SSRF 防护
2. 接收音频/文本/图片 -> STT / LLM / Vision 解析任务
3. 原子配额预扣与失败回滚
4. 封禁 Fail-Closed 校验与可配置 CORS
"""

import asyncio
import base64
import json
import os
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import httpx
import redis.asyncio as redis
from fastapi import (
    Depends,
    FastAPI,
    File,
    Header,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from auth import (
    check_rate_limit,
    decode_token,
    get_current_user_optional,
    get_current_user_required,
    get_model_config_for_tier,
    get_vendor_config,
    load_config,
    validate_jwt_config,
)
from database import (
    create_record,
    get_banned_user_ids,
    get_device_usage,
    get_records_by_user,
    get_user_by_id,
    init_db,
    refund_device_quota,
    refund_user_quota,
    reserve_device_quota,
    reserve_user_quota,
)
from models import User
from schemas import AIParseResult, ProcessAudioResponse, TaskItem
from security import (
    ValidatedOutboundTarget,
    build_pinned_transport,
    detect_image_mime,
    save_upload_file_limited,
    validate_client_time,
    validate_outbound_url,
)

# 临时文件目录
TEMP_DIR = Path(__file__).parent / "temp_audio"
TEMP_DIR.mkdir(exist_ok=True)
TEMP_IMAGE_DIR = Path(__file__).parent / "temp_images"
TEMP_IMAGE_DIR.mkdir(exist_ok=True)

MAX_AUDIO_FILE_SIZE = 10 * 1024 * 1024
MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_AUDIO_EXTS = {".aac", ".m4a", ".mp3", ".wav", ".webm", ".ogg", ".flac", ".mp4"}
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
DEFAULT_PROVIDER_BASE_URL = "https://api.siliconflow.cn/v1"

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
REDIS_BANNED_USERS_KEY = "project_flow:banned_users"

DEFAULT_CORS_ORIGINS = [
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
]


def get_cors_allow_origins() -> List[str]:
    """从环境变量 CORS_ALLOW_ORIGINS 读取允许的跨域来源（逗号分隔）"""
    raw = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
    if not raw:
        return list(DEFAULT_CORS_ORIGINS)
    origins = [item.strip() for item in raw.split(",") if item.strip() and item.strip() != "*"]
    return origins or list(DEFAULT_CORS_ORIGINS)


def _is_usable_server_key(api_key: Optional[str]) -> bool:
    if not api_key:
        return False
    cleaned = api_key.strip()
    if not cleaned:
        return False
    lowered = cleaned.lower()
    if lowered.startswith("your_") or lowered.endswith("_here"):
        return False
    return True


def _sanitize_upload_ext(filename: Optional[str], allowed_exts: set[str], default_ext: str) -> str:
    safe_name = Path(filename or "").name
    ext = Path(safe_name).suffix.lower()
    return ext if ext in allowed_exts else default_ext


def _user_tier_str(user: Optional[User]) -> str:
    if not user or not user.tier:
        return "free"
    return user.tier.value.lower() if hasattr(user.tier, "value") else str(user.tier).lower()


async def resolve_provider_credentials(
    server_api_key: Optional[str],
    server_base_url: Optional[str],
    client_key: Optional[str],
    client_base_url: Optional[str],
    prefer_client_key: bool = False,
) -> tuple[str, str, Optional[ValidatedOutboundTarget]]:
    """
    安全解析上游服务商凭据与地址：
    - 严禁将服务端 api_key 发送到客户端提供的任意 Base-Url
    - 仅当客户端显式提供自有 api_key 且实际采用客户端 key 时，才允许使用客户端 Base-Url，
      且必须通过 SSRF 校验并返回固定 IP 目标（防 DNS Rebinding）
    """
    srv_key = (server_api_key or "").strip()
    srv_url = (server_base_url or "").strip() or DEFAULT_PROVIDER_BASE_URL
    cli_key = (client_key or "").strip()
    cli_url = (client_base_url or "").strip()

    if prefer_client_key:
        if cli_key:
            if cli_url:
                target = await validate_outbound_url(cli_url)
                return cli_key, target.base_url, target
            return cli_key, srv_url, None
        # 客户端未传自有 Key 时绝对不采信客户端 Base-Url
        return srv_key, srv_url, None

    if _is_usable_server_key(srv_key):
        # 服务端已配置有效 Key：始终使用服务端 Base-Url，绝不采信客户端 Base-Url
        return srv_key, srv_url, None

    if cli_key:
        if cli_url:
            target = await validate_outbound_url(cli_url)
            return cli_key, target.base_url, target
        return cli_key, srv_url, None

    return "", srv_url, None


async def sync_banned_users_once(redis_client) -> None:
    """使用临时 Key + RENAME 原子同步封禁用户集合到 Redis"""
    banned_ids = await get_banned_user_ids()
    if banned_ids:
        tmp_key = f"{REDIS_BANNED_USERS_KEY}:tmp:{uuid.uuid4().hex}"
        try:
            await redis_client.sadd(tmp_key, *[str(uid) for uid in banned_ids])
            await redis_client.rename(tmp_key, REDIS_BANNED_USERS_KEY)
        except Exception:
            try:
                await redis_client.delete(tmp_key)
            except Exception:
                pass
            raise
    else:
        await redis_client.delete(REDIS_BANNED_USERS_KEY)


async def sync_banned_users(app: FastAPI):
    """每分钟原子同步封禁用户到 Redis"""
    while True:
        try:
            redis_client = getattr(app.state, "redis", None)
            if redis_client is not None:
                await sync_banned_users_once(redis_client)
        except Exception as e:
            print(f"⚠️ 封禁同步失败: {type(e).__name__}")
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动前强制校验 JWT 密钥配置（Fail-Closed）
    validate_jwt_config()
    await init_db()
    app.state.redis = redis.from_url(REDIS_URL, decode_responses=True)
    app.state.ban_sync_task = asyncio.create_task(sync_banned_users(app))
    print("🚀 Project Flow Backend 启动成功")
    yield
    print("🛑 正在关闭服务...")

    try:
        app.state.ban_sync_task.cancel()
        try:
            await app.state.ban_sync_task
        except asyncio.CancelledError:
            pass
    except Exception as e:
        print(f"⚠️ 停止后台任务失败: {type(e).__name__}")

    redis_client = getattr(app.state, "redis", None)
    if redis_client is not None:
        try:
            close_fn = getattr(redis_client, "aclose", None) or getattr(redis_client, "close", None)
            if close_fn:
                res = close_fn()
                if asyncio.iscoroutine(res):
                    await res
        except Exception as e:
            print(f"⚠️ 关闭 Redis 连接失败: {type(e).__name__}")


app = FastAPI(
    title="Project Flow API",
    description="Flow AI 助手后端 API",
    version="1.1.0",
    lifespan=lifespan,
)


# 先注册自定义中间件，最后注册 CORSMiddleware（Starlette LIFO 顺序保证 403 响应也携带 CORS 头）
@app.middleware("http")
async def ban_check_middleware(request, call_next):
    auth_header = request.headers.get("Authorization")
    parts = auth_header.split(None, 1) if auth_header else []
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1].strip()
        try:
            payload = decode_token(token)
        except RuntimeError:
            return JSONResponse(
                status_code=500,
                content={"detail": "服务端认证配置异常"},
            )

        if payload and payload.get("sub"):
            user_id = str(payload.get("sub"))
            redis_client = getattr(request.app.state, "redis", None)
            redis_checked = False
            if redis_client is not None:
                try:
                    is_banned = await redis_client.sismember(REDIS_BANNED_USERS_KEY, user_id)
                    redis_checked = True
                    if is_banned:
                        return JSONResponse(
                            status_code=403,
                            content={
                                "detail": "账户已被封禁",
                                "code": "ACCOUNT_BANNED",
                                "force_logout": True,
                            },
                        )
                except Exception:
                    redis_checked = False

            # Redis 不可用时绝不放行，直接回落数据库 Fail-Closed 校验
            if not redis_checked:
                try:
                    uid_int = int(user_id)
                except (TypeError, ValueError):
                    return await call_next(request)
                try:
                    user = await get_user_by_id(uid_int)
                except Exception:
                    return JSONResponse(
                        status_code=503,
                        content={"detail": "封禁状态校验暂不可用，请稍后重试"},
                    )
                if user and user.is_banned == 1:
                    return JSONResponse(
                        status_code=403,
                        content={
                            "detail": "账户已被封禁",
                            "code": "ACCOUNT_BANNED",
                            "force_logout": True,
                        },
                    )

    return await call_next(request)


# 最后注册 CORSMiddleware，确保包括 403 在内的所有响应都带正确 CORS 头
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
from routers import auth as auth_router, chat, pomodoro

app.include_router(auth_router.router)
app.include_router(chat.router)
# 统一提供 /api/pomodoro/* 主路径，并保留 /pomodoro/* 向后兼容
app.include_router(pomodoro.router, prefix="/api")
app.include_router(pomodoro.router, include_in_schema=False)


def delete_temp_file(file_path: Path):
    """后台任务：删除临时文件"""
    try:
        if file_path.exists():
            file_path.unlink()
    except Exception as e:
        print(f"⚠️ 删除临时文件失败: {type(e).__name__}")


def get_model_catalog() -> dict:
    config = load_config()
    return config.get("models", {})


def is_model_allowed(entry: dict, tier: str) -> bool:
    tiers = entry.get("tiers")
    if tiers:
        return tier in tiers
    entry_tier = entry.get("tier")
    if not entry_tier:
        return True
    if entry_tier == "vip" and tier != "vip":
        return False
    return True


def is_vip_model(entry: Optional[dict]) -> bool:
    if not entry:
        return False
    return entry.get("tier") == "vip"


def find_model_entry(models: dict, group: str, model_id: str) -> Optional[dict]:
    for entry in models.get(group, []):
        if entry.get("id") == model_id:
            return entry
    return None


def _get_vendor_for_entry(entry: Optional[dict], fallback_config: dict) -> tuple[str, str]:
    if entry and entry.get("vendor"):
        vendor_cfg = get_vendor_config(entry["vendor"])
        if vendor_cfg:
            return vendor_cfg.get("api_key", ""), vendor_cfg.get("base_url", "")
    return fallback_config.get("api_key", ""), fallback_config.get("base_url", "")


def _build_outbound_client(timeout: float, pinned_target: Optional[ValidatedOutboundTarget] = None) -> httpx.AsyncClient:
    """构建禁用重定向的出站客户端；当存在客户端自定义目标时在连接层固定已校验公网 IP"""
    kwargs = {"timeout": timeout, "follow_redirects": False}
    if pinned_target is not None:
        kwargs["transport"] = build_pinned_transport(pinned_target)
        kwargs["trust_env"] = False
    return httpx.AsyncClient(**kwargs)


async def call_stt_api(
    file_path: Path,
    api_key: str,
    base_url: str = DEFAULT_PROVIDER_BASE_URL,
    model: str = "FunAudioLLM/SenseVoiceSmall",
    pinned_target: Optional[ValidatedOutboundTarget] = None,
) -> str:
    """调用 STT API 进行语音转文字（禁用重定向、支持 IP 固定并脱敏上游报错）"""
    url = f"{base_url.rstrip('/')}/audio/transcriptions"

    async with _build_outbound_client(60.0, pinned_target=pinned_target) as client:
        with open(file_path, "rb") as f:
            files = {"file": (file_path.name, f, "audio/aac")}
            data = {"model": model}
            headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}

            try:
                response = await client.post(url, files=files, data=data, headers=headers)

                if response.status_code != 200:
                    print(f"❌ STT API Error Status: {response.status_code}")
                    raise HTTPException(
                        status_code=502,
                        detail="语音识别服务暂时不可用，请稍后重试",
                    )

                result = response.json()
                return result.get("text", "")
            except HTTPException:
                raise
            except httpx.RequestError as e:
                print(f"❌ STT Request Error: {type(e).__name__}")
                raise HTTPException(status_code=502, detail="语音识别服务网络请求失败，请稍后重试")
            except ValueError:
                print("❌ STT Invalid JSON Response")
                raise HTTPException(status_code=502, detail="语音识别服务响应解析失败")
            except Exception as e:
                print(f"❌ STT Unexpected Error: {type(e).__name__}")
                raise HTTPException(status_code=500, detail="语音识别处理失败，请稍后重试")


async def call_llm_api(
    text: str,
    api_key: str,
    base_url: str = DEFAULT_PROVIDER_BASE_URL,
    model: str = "Qwen/Qwen2.5-7B-Instruct",
    client_time: Optional[str] = None,
    pinned_target: Optional[ValidatedOutboundTarget] = None,
) -> AIParseResult:
    """调用 LLM API 解析文本，提取任务信息（严格校验时间、禁用重定向、支持 IP 固定、脱敏报错）"""
    validated_time = validate_client_time(client_time)
    current_time_str = validated_time or datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    system_prompt = f"""You are an intelligent task extraction assistant. Current time: {current_time_str}.
Your goal is to extract tasks, reminders, or to-do items from the user's input (which may be transcribed speech).

**CRITICAL RULE: Output Language**
- The `summary`, `title`, and `suggestion` fields MUST be in the **SAME LANGUAGE** as the user's input.
- If the user speaks English, output English.
- If the user speaks Chinese, output Chinese.

**EXTRACTION RULES - FOLLOW STRICTLY:**

1. **Task Splitting (MANDATORY - READ CAREFULLY)**:
   ⚠️ **YOU MUST CREATE SEPARATE TASKS FOR EACH DISTINCT ACTIVITY.**
   - If user says multiple activities (breakfast, shopping, golf, dinner), create ONE task per activity.
   - DO NOT merge them into one task with subtasks.
   - BAD ❌: title="24号的安排", subtasks=["吃早饭", "逛街", "打高尔夫"]
   - GOOD ✅: Multiple tasks: {{"title": "吃早饭", ...}}, {{"title": "逛街", ...}}, {{"title": "打高尔夫", ...}}

   **When to use subtasks:**
   - ONLY use subtasks for a shopping list (e.g. "买苹果、牛奶、面包" → ONE task "购物" with subtasks)
   - ONLY use subtasks for multi-step single actions (e.g. "写报告:收集数据、撰写草稿、修改" → ONE task with steps)

   **When to create separate tasks:**
   - Different times of day → separate tasks
   - Different locations → separate tasks
   - Different action verbs → separate tasks

2. **Location**: Extract location if mentioned. Otherwise null.

3. **Time Extraction (STRICT)**:
   - You MUST calculate the estimated `timestamp` (YYYY-MM-DD HH:MM:SS) based on the current time ({current_time_str}).
   - **Date Resolution**: If user says "24th" or "24号", assume the 24th of the current month. If today is past the 24th, assume next month.
   - **Time Resolution**: "morning"->09:00, "noon"->12:00, "afternoon"->15:00, "evening/night"->20:00.
   - If NO specific time is mentioned, timestamp can be null.

Return ONLY the raw JSON object:
{{
    "tasks": [
        {{
            "title": "Specific Activity Title (e.g. 'Eat Breakfast' NOT '24th Eat Breakfast' - STRIP DATE/TIME)",
            "time": "Original time description (e.g. '24th morning')",
            "timestamp": "YYYY-MM-DD HH:MM:SS (Required for calendar events)",
            "location": "Location or null",
            "suggestion": "Brief suggestion or null",
            "priority": "low/normal/high",
            "subtasks": []
        }}
    ],
    "summary": "Summary of created tasks"
}}

CRITICAL EXAMPLES:

✅ CORRECT Example:
User: "24号上午吃早饭，中午回家睡觉，下午去山姆超市买点星巴克纸杯" (Current: 2026-01-23)
Output: {{
    "tasks": [
        {{"title": "吃早饭", "time": "24号上午", "timestamp": "2026-01-24 09:00:00", "location": null, "suggestion": null, "priority": "normal", "subtasks": []}},
        {{"title": "回家睡觉", "time": "24号中午", "timestamp": "2026-01-24 12:00:00", "location": "家", "suggestion": null, "priority": "normal", "subtasks": []}},
        {{"title": "去山姆超市购物", "time": "24号下午", "timestamp": "2026-01-24 15:00:00", "location": "山姆超市", "suggestion": "记得买星巴克纸杯", "priority": "normal", "subtasks": []}}
    ],
    "summary": "安排了24号的早饭、午休和购物"
}}

❌ WRONG Example (DO NOT DO THIS):
{{
    "tasks": [
        {{"title": "24号的计划", "subtasks": ["早上吃早饭", "中午回家睡觉", "下午去山姆超市"]}}
    ]
}}

注意事项：
1. timestamp 必须是 YYYY-MM-DD HH:MM:SS 格式。
2. 即使是单纯的日期（如24号），也要填入 timestamp（默认设为当天 09:00:00）。
3. **再次强调：不同的活动必须分开为独立的任务，不要合并！**
4. 只返回 JSON。"""

    base_url = base_url.rstrip("/")
    url = base_url if base_url.endswith("/chat/completions") else f"{base_url}/chat/completions"

    async with _build_outbound_client(60.0, pinned_target=pinned_target) as client:
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
        }

        try:
            response = await client.post(url, json=payload, headers=headers)

            if response.status_code != 200:
                print(f"❌ LLM API Error Status: {response.status_code}")
                raise HTTPException(
                    status_code=502,
                    detail="语言模型服务暂时不可用，请稍后重试",
                )

            try:
                result = response.json()
            except ValueError:
                print("❌ LLM Invalid JSON Response")
                raise HTTPException(status_code=502, detail="语言模型返回内容格式异常")

            try:
                content = result["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError):
                raise HTTPException(status_code=502, detail="语言模型返回数据结构异常")

            try:
                parsed = json.loads(clean_json_string(content))
                tasks = [TaskItem(**task) for task in parsed.get("tasks", [])]
                return AIParseResult(tasks=tasks, summary=parsed.get("summary"))
            except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                return AIParseResult(
                    tasks=[TaskItem(title=text[:100], suggestion="无法完全解析，请检查原文")],
                    summary=None,
                )
        except HTTPException:
            raise
        except httpx.RequestError as e:
            print(f"❌ LLM Request Error: {type(e).__name__}")
            raise HTTPException(status_code=502, detail="语言模型网络请求失败，请稍后重试")


def clean_json_string(s: str) -> str:
    """清理 JSON 字符串，移除 Markdown 代码块标记"""
    if "```" in s:
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", s, re.DOTALL)
        if match:
            return match.group(1)
    return s.strip()


async def call_vision_api(
    image_path: Path,
    api_key: str,
    base_url: str = DEFAULT_PROVIDER_BASE_URL,
    model: str = "THUDM/GLM-4.1V-9B-Thinking",
    mime_type: str = "image/jpeg",
    pinned_target: Optional[ValidatedOutboundTarget] = None,
) -> AIParseResult:
    """调用多模态模型进行图片解析（禁用重定向、支持 IP 固定、不打印密钥、脱敏报错）"""
    url = f"{base_url.rstrip('/')}/chat/completions"

    with open(image_path, "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode("utf-8")

    system_prompt = """你是一个智能任务提取助手。用户会给你一张图片，请从图片内容中识别任务、提醒或待办事项，并输出 JSON。

请严格按照以下 JSON 格式返回：
{
  "tasks": [
    {
      "title": "任务标题",
      "time": "原文相对时间",
      "timestamp": "YYYY-MM-DD HH:MM:SS",
      "location": "地点",
      "suggestion": "AI 建议",
      "priority": "low/normal/high",
      "subtasks": ["子任务"]
    }
  ],
  "summary": "总结"
}

注意：
1. timestamp 必须是 YYYY-MM-DD HH:MM:SS 格式。
2. 只返回 JSON，不要输出其他文本。
"""

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "请解析图片内容并提取任务信息。"},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_base64}"}},
                ],
            },
        ],
        "temperature": 0.2,
    }

    async with _build_outbound_client(90.0, pinned_target=pinned_target) as client:
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        try:
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code != 200:
                print(f"⚠️ Vision API Error Status: {response.status_code}")
                raise HTTPException(
                    status_code=502,
                    detail="视觉模型服务暂时不可用，请稍后重试",
                )

            try:
                result = response.json()
                content = result["choices"][0]["message"]["content"]
            except (ValueError, KeyError, IndexError, TypeError):
                raise HTTPException(status_code=502, detail="视觉模型返回数据结构异常")

            try:
                cleaned_content = clean_json_string(content)
                parsed = json.loads(cleaned_content)
                tasks = [TaskItem(**task) for task in parsed.get("tasks", [])]
                return AIParseResult(tasks=tasks, summary=parsed.get("summary"))
            except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                return AIParseResult(
                    tasks=[TaskItem(title="无法解析图片内容", suggestion="请检查图片清晰度")],
                    summary=None,
                )
        except HTTPException:
            raise
        except httpx.RequestError as e:
            print(f"❌ Vision Request Error: {type(e).__name__}")
            raise HTTPException(status_code=502, detail="视觉模型网络请求失败，请稍后重试")


@app.get("/")
async def root():
    """健康检查接口"""
    return {"status": "ok", "message": "Project Flow API is running"}


@app.get("/api/health")
async def health_check():
    """健康检查（不暴露服务器内部绝对路径）"""
    return {
        "status": "healthy",
        "version": "1.1.0",
    }


@app.get("/api/models")
async def get_models(
    x_device_id: str = Header(default="unknown", alias="X-Device-ID"),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """获取模型列表与剩余次数"""
    config = load_config()
    catalog = get_model_catalog()
    tier = _user_tier_str(current_user) if current_user else "guest"
    today = datetime.now().strftime("%Y-%m-%d")

    if current_user:
        text_used = current_user.text_daily_usage if current_user.last_usage_date == today else 0
        vision_used = current_user.vision_daily_usage if current_user.last_usage_date == today else 0
        stt_used = 0
        free_text_limit = int(config.get("limits", {}).get("free_daily_limit", 10))
        if tier == "vip":
            text_limit = -1
            stt_limit = -1
            vision_limit = 10
        else:
            text_limit = free_text_limit
            stt_limit = -1
            vision_limit = 1
    else:
        usage = await get_device_usage(x_device_id)
        text_used = usage.text_count
        vision_used = usage.vision_count
        stt_used = usage.stt_count
        text_limit = 3
        stt_limit = 1
        vision_limit = 0

    def remaining(limit: int, used: int) -> int:
        if limit < 0:
            return -1
        return max(0, limit - used)

    limits = {
        "text": {
            "limit": text_limit,
            "remaining": remaining(text_limit, text_used),
        },
        "stt": {
            "limit": stt_limit,
            "remaining": remaining(stt_limit, stt_used if current_user is None else 0),
        },
        "vision": {
            "limit": vision_limit,
            "remaining": remaining(vision_limit, vision_used),
        },
    }

    def build_group(group: str):
        items = []
        for entry in catalog.get(group, []):
            allowed = is_model_allowed(entry, "free" if tier == "guest" else tier)
            if tier == "guest" and group == "vision":
                allowed = False
            items.append(
                {
                    "id": entry.get("id"),
                    "name": entry.get("name") or entry.get("id"),
                    "vendor": entry.get("vendor", "unknown"),
                    "tier": entry.get("tier"),
                    "tiers": entry.get("tiers"),
                    "is_default": entry.get("is_default", False),
                    "available": allowed,
                    "tag": entry.get("tag"),
                }
            )
        return items

    return {
        "tier": tier,
        "models": {
            "llm": build_group("llm"),
            "vision": build_group("vision"),
            "stt": build_group("stt"),
        },
        "limits": limits,
    }


@app.post("/api/process-audio", response_model=ProcessAudioResponse)
async def process_audio(
    file: UploadFile = File(...),
    x_stt_base_url: Optional[str] = Header(None, alias="X-STT-Base-Url"),
    x_stt_key: Optional[str] = Header(None, alias="X-STT-Key"),
    x_stt_model: Optional[str] = Header(None, alias="X-STT-Model"),
    x_llm_base_url: Optional[str] = Header(None, alias="X-LLM-Base-Url"),
    x_llm_key: Optional[str] = Header(None, alias="X-LLM-Key"),
    x_llm_model: Optional[str] = Header(None, alias="X-LLM-Model"),
    x_device_id: str = Header(default="unknown", alias="X-Device-ID"),
    x_client_time: Optional[str] = Header(None, alias="X-Client-Time"),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """音频处理主接口"""
    validated_client_time = validate_client_time(x_client_time)

    file_ext = _sanitize_upload_ext(file.filename, ALLOWED_AUDIO_EXTS, ".aac")
    temp_filename = f"{uuid.uuid4()}{file_ext}"
    temp_path = TEMP_DIR / temp_filename

    user_quota_reserved = False
    guest_stt_reserved = False
    guest_text_reserved = False
    llm_is_vip = False

    try:
        # 1. 分块流式写入并校验大小上限 (10MB)
        await save_upload_file_limited(
            file,
            temp_path,
            MAX_AUDIO_FILE_SIZE,
            "音频文件过大 (限制 10MB)",
        )

        # 2. 校验模型与权限
        catalog = get_model_catalog()
        user_tier = _user_tier_str(current_user)
        stt_config = get_model_config_for_tier(user_tier, "stt")
        llm_config = get_model_config_for_tier(user_tier, "llm")

        requested_stt_model = x_stt_model or stt_config.get("model") or "FunAudioLLM/SenseVoiceSmall"
        stt_entry = find_model_entry(catalog, "stt", requested_stt_model)
        if stt_entry and not is_model_allowed(stt_entry, user_tier):
            return JSONResponse(
                status_code=403,
                content={"detail": "当前账户无权限使用该语音模型。", "code": "MODEL_NOT_ALLOWED"},
            )
        if x_stt_model and not stt_entry:
            return JSONResponse(
                status_code=400,
                content={"detail": "未知语音模型。", "code": "MODEL_NOT_FOUND"},
            )

        requested_llm_model = x_llm_model or llm_config.get("model") or "Qwen/Qwen2.5-7B-Instruct"
        llm_entry = find_model_entry(catalog, "llm", requested_llm_model)
        if llm_entry and not is_model_allowed(llm_entry, user_tier):
            return JSONResponse(
                status_code=403,
                content={"detail": "当前账户无权限使用该语言模型。", "code": "MODEL_NOT_ALLOWED"},
            )
        if x_llm_model and not llm_entry:
            return JSONResponse(
                status_code=400,
                content={"detail": "未知语言模型。", "code": "MODEL_NOT_FOUND"},
            )
        llm_is_vip = is_vip_model(llm_entry)

        # 3. 安全解析 STT 与 LLM 上游凭据（防 SSRF、DNS Rebinding & 服务端 Key 泄露）
        srv_stt_key, srv_stt_url = _get_vendor_for_entry(stt_entry, stt_config)
        final_stt_key, final_stt_base_url, stt_target = await resolve_provider_credentials(
            srv_stt_key, srv_stt_url, x_stt_key, x_stt_base_url, prefer_client_key=False
        )
        srv_llm_key, srv_llm_url = _get_vendor_for_entry(llm_entry, llm_config)
        final_llm_key, final_llm_base_url, llm_target = await resolve_provider_credentials(
            srv_llm_key, srv_llm_url, x_llm_key, x_llm_base_url, prefer_client_key=False
        )

        # 4. 原子预扣配额
        if current_user:
            await check_rate_limit(current_user, is_vip_model=llm_is_vip)
            user_quota_reserved = True
        else:
            if not await reserve_device_quota(x_device_id, "stt", limit=1):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "语音试用次数已用完，请登录继续使用。", "code": "STT_LIMIT_REACHED"},
                )
            guest_stt_reserved = True
            if not await reserve_device_quota(x_device_id, "text", limit=3):
                await refund_device_quota(x_device_id, "stt")
                guest_stt_reserved = False
                return JSONResponse(
                    status_code=403,
                    content={"detail": "文字模型次数已用完，请登录继续使用。", "code": "TEXT_LIMIT_REACHED"},
                )
            guest_text_reserved = True

        # 5. 调用 STT API
        raw_text = await call_stt_api(
            temp_path,
            final_stt_key,
            final_stt_base_url,
            requested_stt_model,
            pinned_target=stt_target,
        )

        if not raw_text.strip():
            if user_quota_reserved and current_user:
                await refund_user_quota(current_user.id, "text", is_vip_model=llm_is_vip)
                user_quota_reserved = False
            if guest_text_reserved:
                await refund_device_quota(x_device_id, "text")
                guest_text_reserved = False
            return ProcessAudioResponse(
                success=False,
                raw_text="",
                error="语音识别结果为空，请重新录制",
            )

        # 6. 调用 LLM API 解析任务
        ai_result = await call_llm_api(
            raw_text,
            final_llm_key,
            final_llm_base_url,
            requested_llm_model,
            client_time=validated_client_time,
            pinned_target=llm_target,
        )

        # 7. 保存到数据库
        ai_json = ai_result.model_dump_json()
        user_id = current_user.id if current_user else None
        record = await create_record(raw_text, ai_json, x_device_id, user_id=user_id)

        return ProcessAudioResponse(
            success=True,
            raw_text=raw_text,
            ai_result=ai_result,
            record_id=record.id,
        )

    except HTTPException:
        if user_quota_reserved and current_user:
            await refund_user_quota(current_user.id, "text", is_vip_model=llm_is_vip)
        if guest_stt_reserved:
            await refund_device_quota(x_device_id, "stt")
        if guest_text_reserved:
            await refund_device_quota(x_device_id, "text")
        raise
    except Exception as e:
        if user_quota_reserved and current_user:
            await refund_user_quota(current_user.id, "text", is_vip_model=llm_is_vip)
        if guest_stt_reserved:
            await refund_device_quota(x_device_id, "stt")
        if guest_text_reserved:
            await refund_device_quota(x_device_id, "text")
        print(f"❌ 处理音频时出错: {type(e).__name__}")
        return ProcessAudioResponse(
            success=False,
            raw_text="",
            error="音频处理失败，请稍后重试",
        )
    finally:
        delete_temp_file(temp_path)


class ProcessTextRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)

    @field_validator("text")
    @classmethod
    def validate_text_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("文本内容不能为空")
        return value


@app.post("/api/process-text", response_model=ProcessAudioResponse)
async def process_text(
    request: ProcessTextRequest,
    x_llm_base_url: Optional[str] = Header(None, alias="X-LLM-Base-Url"),
    x_llm_key: Optional[str] = Header(None, alias="X-LLM-Key"),
    x_llm_model: Optional[str] = Header(None, alias="X-LLM-Model"),
    x_device_id: str = Header(default="unknown", alias="X-Device-ID"),
    x_client_time: Optional[str] = Header(None, alias="X-Client-Time"),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """处理纯文本输入 (LLM 任务提取)"""
    validated_client_time = validate_client_time(x_client_time)

    user_quota_reserved = False
    guest_text_reserved = False
    llm_is_vip = False

    try:
        user_tier = _user_tier_str(current_user)
        llm_config = get_model_config_for_tier(user_tier, "llm")
        catalog = get_model_catalog()

        requested_llm_model = x_llm_model or llm_config.get("model") or "Qwen/Qwen2.5-7B-Instruct"
        llm_entry = find_model_entry(catalog, "llm", requested_llm_model)
        if llm_entry and not is_model_allowed(llm_entry, user_tier):
            return JSONResponse(
                status_code=403,
                content={"detail": "当前账户无权限使用该语言模型。", "code": "MODEL_NOT_ALLOWED"},
            )
        if x_llm_model and not llm_entry:
            return JSONResponse(
                status_code=400,
                content={"detail": "未知语言模型。", "code": "MODEL_NOT_FOUND"},
            )
        llm_is_vip = is_vip_model(llm_entry)

        srv_llm_key, srv_llm_url = _get_vendor_for_entry(llm_entry, llm_config)
        final_llm_key, final_llm_base_url, llm_target = await resolve_provider_credentials(
            srv_llm_key, srv_llm_url, x_llm_key, x_llm_base_url, prefer_client_key=False
        )

        # 原子预扣配额
        if current_user:
            await check_rate_limit(current_user, is_vip_model=llm_is_vip)
            user_quota_reserved = True
        else:
            if not await reserve_device_quota(x_device_id, "text", limit=3):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "文字模型次数已用完，请登录继续使用。", "code": "TEXT_LIMIT_REACHED"},
                )
            guest_text_reserved = True

        ai_result = await call_llm_api(
            request.text,
            final_llm_key,
            final_llm_base_url,
            requested_llm_model,
            client_time=validated_client_time,
            pinned_target=llm_target,
        )

        ai_json = ai_result.model_dump_json()
        user_id = current_user.id if current_user else None
        record = await create_record(request.text, ai_json, x_device_id, user_id=user_id)

        return ProcessAudioResponse(
            success=True,
            raw_text=request.text,
            ai_result=ai_result,
            record_id=record.id,
        )

    except HTTPException:
        if user_quota_reserved and current_user:
            await refund_user_quota(current_user.id, "text", is_vip_model=llm_is_vip)
        if guest_text_reserved:
            await refund_device_quota(x_device_id, "text")
        raise
    except Exception as e:
        if user_quota_reserved and current_user:
            await refund_user_quota(current_user.id, "text", is_vip_model=llm_is_vip)
        if guest_text_reserved:
            await refund_device_quota(x_device_id, "text")
        print(f"❌ 处理文本时出错: {type(e).__name__}")
        return ProcessAudioResponse(
            success=False,
            raw_text=request.text,
            error="文本处理失败，请稍后重试",
        )


@app.post("/api/process-image", response_model=ProcessAudioResponse)
async def process_image(
    file: UploadFile = File(...),
    x_vision_base_url: Optional[str] = Header(None, alias="X-Vision-Base-Url"),
    x_vision_key: Optional[str] = Header(None, alias="X-Vision-Key"),
    x_vision_model: Optional[str] = Header(None, alias="X-Vision-Model"),
    x_device_id: str = Header(default="unknown", alias="X-Device-ID"),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """图片解析接口（需登录、流式限流+魔数校验、防 SSRF 与 Key 窃取、原子配额预扣与失败回滚）"""
    if not current_user:
        return JSONResponse(
            status_code=403,
            content={"detail": "视觉模型需要登录后使用。", "code": "VISION_LOGIN_REQUIRED"},
        )

    file_ext = _sanitize_upload_ext(file.filename, ALLOWED_IMAGE_EXTS, ".jpg")
    temp_filename = f"{uuid.uuid4()}{file_ext}"
    temp_path = TEMP_IMAGE_DIR / temp_filename
    vision_quota_reserved = False

    try:
        # 1. 流式读取并校验文件大小 (10MB)
        _size, header_bytes = await save_upload_file_limited(
            file,
            temp_path,
            MAX_IMAGE_FILE_SIZE,
            "图片文件过大 (限制 10MB)",
        )

        # 2. 魔数校验真实图片格式
        detected_mime = detect_image_mime(header_bytes)
        if not detected_mime:
            raise HTTPException(
                status_code=400,
                detail="不支持的图片格式，仅支持 JPEG/PNG/WebP/GIF",
            )

        background_config = load_config()
        catalog = get_model_catalog()
        user_tier = _user_tier_str(current_user)

        # 3. 确定使用的模型 ID 与权限
        requested_vision_model = x_vision_model
        if not requested_vision_model:
            defaults = background_config.get("defaults", {})
            tier_defaults = defaults.get(user_tier, defaults.get("free", {}))
            requested_vision_model = tier_defaults.get("vision", "THUDM/GLM-4.1V-9B-Thinking")

        vision_entry = find_model_entry(catalog, "vision", requested_vision_model)
        if vision_entry and not is_model_allowed(vision_entry, user_tier):
            return JSONResponse(
                status_code=403,
                content={"detail": "当前账户无权限使用该视觉模型。", "code": "MODEL_NOT_ALLOWED"},
            )
        if x_vision_model and not vision_entry:
            return JSONResponse(
                status_code=400,
                content={"detail": "未知视觉模型。", "code": "MODEL_NOT_FOUND"},
            )

        # 4. 严格隔离服务端 Key 与客户端 Base-Url：未传自有 X-Vision-Key 时绝不采信 X-Vision-Base-Url
        vision_default_cfg = get_model_config_for_tier(user_tier, "vision")
        srv_vision_key, srv_vision_url = _get_vendor_for_entry(vision_entry, vision_default_cfg)
        final_vision_key, final_vision_base_url, vision_target = await resolve_provider_credentials(
            srv_vision_key,
            srv_vision_url,
            x_vision_key,
            x_vision_base_url,
            prefer_client_key=True,
        )

        # 5. 原子预扣视觉模型配额（防并发穿透）
        allowed, _remaining = await reserve_user_quota(current_user.id, "vision", is_vip_model=False)
        if not allowed:
            return JSONResponse(
                status_code=403,
                content={"detail": "视觉模型次数已用完，请明天再试或升级 VIP。", "code": "VISION_LIMIT_REACHED"},
            )
        vision_quota_reserved = True

        # 6. 调用视觉模型
        ai_result = await call_vision_api(
            temp_path,
            final_vision_key,
            final_vision_base_url,
            requested_vision_model,
            mime_type=detected_mime,
            pinned_target=vision_target,
        )

        ai_json = ai_result.model_dump_json()
        record = await create_record("[image]", ai_json, x_device_id, user_id=current_user.id)

        return ProcessAudioResponse(
            success=True,
            raw_text="[image]",
            ai_result=ai_result,
            record_id=record.id,
        )

    except HTTPException:
        if vision_quota_reserved:
            await refund_user_quota(current_user.id, "vision", is_vip_model=False)
        raise
    except Exception as e:
        if vision_quota_reserved:
            await refund_user_quota(current_user.id, "vision", is_vip_model=False)
        print(f"❌ 处理图片时出错: {type(e).__name__}")
        return ProcessAudioResponse(
            success=False,
            raw_text="[image]",
            error="图片处理失败，请稍后重试",
        )
    finally:
        delete_temp_file(temp_path)


@app.get("/api/records")
async def get_records(
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user_required),
):
    """获取当前登录用户自己的历史记录（强制鉴权与数据隔离）"""
    records = await get_records_by_user(current_user.id, limit)
    serialized = [
        {
            "id": r.id,
            "raw_text": r.raw_text,
            "ai_json": r.ai_json,
            "device_id": r.device_id,
            "user_id": r.user_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]
    return {"records": serialized, "count": len(serialized)}


@app.post("/api/test-connection")
async def test_connection(
    x_llm_base_url: str = Header(default=DEFAULT_PROVIDER_BASE_URL, alias="X-LLM-Base-Url"),
    x_llm_key: str = Header(..., alias="X-LLM-Key"),
    _current_user: User = Depends(get_current_user_required),
):
    """
    测试 LLM API 连接（需登录鉴权 + 严格出站 SSRF 校验 + 连接层 IP 固定防 DNS Rebinding + 禁用重定向 + 统一脱敏响应）
    """
    target = await validate_outbound_url(x_llm_base_url)
    url = f"{target.base_url}/models"

    try:
        async with _build_outbound_client(10.0, pinned_target=target) as client:
            response = await client.get(
                url,
                headers={"Authorization": f"Bearer {x_llm_key}"},
            )
            if response.status_code == 200:
                return {"success": True, "message": "API Key 验证成功"}
            if response.status_code in (401, 403):
                return {"success": False, "message": "API Key 无效或无权限"}
            return {"success": False, "message": f"验证失败 (HTTP {response.status_code})"}
    except Exception as e:
        # 统一失败文案（不区分超时与连接失败，避免端口探测预言机）
        print(f"⚠️ test-connection failed: {type(e).__name__}")
        return {"success": False, "message": "连接失败，请检查服务地址或网络配置"}


class AnalyzeTaskItem(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    timestamp: Optional[str] = Field(None, max_length=64)
    completed: bool = False
    priority: Optional[str] = Field("normal", max_length=20)
    location: Optional[str] = Field(None, max_length=200)


class AnalyzeTasksRequest(BaseModel):
    tasks: List[AnalyzeTaskItem] = Field(..., max_length=500)
    period: str = Field(..., pattern=r"^(weekly|monthly)$")
    start_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")


@app.post("/api/analyze-tasks")
async def analyze_tasks(
    request: AnalyzeTasksRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """AI-driven task analysis for VIP users"""
    if not current_user or _user_tier_str(current_user) != "vip":
        return JSONResponse(
            status_code=403,
            content={"detail": "此功能仅对 VIP 用户开放", "code": "VIP_REQUIRED"},
        )

    llm_config = get_model_config_for_tier("vip", "llm")
    llm_key = llm_config.get("api_key", "")
    llm_base_url = llm_config.get("base_url") or DEFAULT_PROVIDER_BASE_URL
    llm_model = llm_config.get("model") or "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B"

    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    tasks_summary = "\n".join(
        [
            f"- {t.title} ({t.timestamp or 'N/A'}, {'✓' if t.completed else '✗'})"
            for t in request.tasks
        ]
    )

    system_prompt = f"""你是任务分析专家。分析 {request.start_date} 到 {request.end_date} 的任务。

任务：
1. 分类统计：分成3-5个类别（如工作/个人/健康），统计数量，分配颜色（hex）
2. 简洁洞察：2-3句话总结建议

返回JSON（无其他文字）：
{{
    "categories": [{{"name": "工作", "count": 12, "color": "#f97316"}}],
    "insights": "你的专注时间集中在上午9-11点。建议在这个时间段安排深度工作。",
    "generated_at": "{current_time}"
}}

任务列表：
{tasks_summary}
"""

    url = f"{llm_base_url.rstrip('/')}/chat/completions"

    async with httpx.AsyncClient(timeout=60.0, follow_redirects=False) as client:
        headers = {"Content-Type": "application/json"}
        if llm_key:
            headers["Authorization"] = f"Bearer {llm_key}"

        payload = {
            "model": llm_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"分析这 {len(request.tasks)} 个任务"},
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
        }

        try:
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code != 200:
                print(f"❌ Analyze Tasks LLM Error Status: {response.status_code}")
                raise HTTPException(status_code=502, detail="任务分析服务暂时不可用，请稍后重试")

            try:
                result = response.json()
                content = result["choices"][0]["message"]["content"]
            except (ValueError, KeyError, IndexError, TypeError):
                raise HTTPException(status_code=502, detail="任务分析返回数据结构异常")

            try:
                parsed = json.loads(clean_json_string(content))
                return parsed
            except (json.JSONDecodeError, ValueError, TypeError):
                raise HTTPException(status_code=502, detail="无法解析AI响应")
        except HTTPException:
            raise
        except httpx.RequestError as e:
            print(f"❌ Analyze Tasks Request Error: {type(e).__name__}")
            raise HTTPException(status_code=502, detail="任务分析网络请求失败，请稍后重试")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
