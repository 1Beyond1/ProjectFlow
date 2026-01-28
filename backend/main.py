"""
Project Flow Backend - FastAPI 主应用

核心功能：
1. 动态从 HTTP Header 读取 API 配置
2. 接收音频文件 -> STT 转文字 -> LLM 解析任务
3. BackgroundTasks 自动删除临时音频文件
4. 完整 CORS 配置支持真机调试
"""

import os
import asyncio
import base64
import json
import uuid
import httpx
from pathlib import Path
from contextlib import asynccontextmanager
import redis.asyncio as redis
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, File, UploadFile, Header, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import (
    init_db,
    engine,  # Import engine for disposal
    create_record,
    get_records_by_device,
    get_all_records,
    increment_user_usage,
    get_device_usage,
    increment_device_usage,
    get_banned_user_ids,
)
from schemas import ProcessAudioResponse, AIParseResult, TaskItem
from pydantic import BaseModel
from fastapi import Depends
from auth import (
    get_current_user_optional, 
    check_rate_limit, 
    get_model_config_for_tier,
    get_vendor_config,
    find_model_by_id,
    load_config, 
    decode_token
)
from models import User

# 临时文件目录
TEMP_DIR = Path(__file__).parent / "temp_audio"
TEMP_DIR.mkdir(exist_ok=True)
TEMP_IMAGE_DIR = Path(__file__).parent / "temp_images"
TEMP_IMAGE_DIR.mkdir(exist_ok=True)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
REDIS_BANNED_USERS_KEY = "project_flow:banned_users"

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时初始化数据库
    await init_db()
    app.state.redis = redis.from_url(REDIS_URL, decode_responses=True)
    app.state.ban_sync_task = asyncio.create_task(sync_banned_users(app))
    print("🚀 Project Flow Backend 启动成功")
    yield
    # 关闭时清理
    print("🛑 正在关闭服务...")
    
    # 1. 取消后台任务
    try:
        app.state.ban_sync_task.cancel()
        try:
            await app.state.ban_sync_task
        except asyncio.CancelledError:
            pass
    except Exception as e:
        print(f"⚠️ 停止后台任务失败: {e}")

    # 2. 关闭 Redis 连接
    # 关闭时清理资源 (如有)
    pass


app = FastAPI(
    title="Project Flow API",
    description="Flow AI 助手后端 API",
    version="1.0.0",
    lifespan=lifespan
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:19006",
        "http://127.0.0.1:19006",
        "http://192.168.31.45:8081",
        "http://192.168.31.45:19006",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
from routers import auth, chat, pomodoro
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(pomodoro.router)


@app.middleware("http")
async def ban_check_middleware(request, call_next):
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        payload = decode_token(token)
        if payload and payload.get("sub"):
            user_id = str(payload.get("sub"))
            try:
                is_banned = await request.app.state.redis.sismember(REDIS_BANNED_USERS_KEY, user_id)
                if is_banned:
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "账户已被封禁", "code": "ACCOUNT_BANNED", "force_logout": True},
                    )
            except Exception:
                pass
    return await call_next(request)


def delete_temp_file(file_path: Path):
    """后台任务：删除临时音频文件"""
    try:
        if file_path.exists():
            file_path.unlink()
            print(f"🗑️ 已删除临时文件: {file_path.name}")
    except Exception as e:
        print(f"⚠️ 删除临时文件失败: {e}")


async def sync_banned_users(app: FastAPI):
    """每分钟同步封禁用户到 Redis"""
    while True:
        try:
            banned_ids = await get_banned_user_ids()
            redis_client = app.state.redis
            await redis_client.delete(REDIS_BANNED_USERS_KEY)
            if banned_ids:
                await redis_client.sadd(REDIS_BANNED_USERS_KEY, *[str(uid) for uid in banned_ids])
        except Exception as e:
            print(f"⚠️ 封禁同步失败: {e}")
        await asyncio.sleep(60)


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



async def call_stt_api(
    file_path: Path,
    api_key: str,
    base_url: str = "https://api.siliconflow.cn/v1",
    model: str = "FunAudioLLM/SenseVoiceSmall"
) -> str:
    """
    调用 STT API 进行语音转文字
    """
    # 确保 URL 正确拼接
    url = f"{base_url.rstrip('/')}/audio/transcriptions"
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        with open(file_path, "rb") as f:
            files = {"file": (file_path.name, f, "audio/aac")}
            data = {"model": model}
            headers = {"Authorization": f"Bearer {api_key}"}
            
            try:
                response = await client.post(url, files=files, data=data, headers=headers)
                
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"STT API 调用失败: {response.text}"
                    )
                
                result = response.json()
                return result.get("text", "")
            except httpx.RequestError as e:
                print(f"❌ STT Request Error: {type(e).__name__}: {e}")
                raise HTTPException(status_code=500, detail=f"STT 网络请求失败: {type(e).__name__} - {str(e)}")
            except Exception as e:
                print(f"❌ STT Unexpected Error: {type(e).__name__}: {e}")
                raise HTTPException(status_code=500, detail=f"STT 未知错误: {str(e)}")


async def call_llm_api(
    text: str,
    api_key: str,
    base_url: str = "https://api.siliconflow.cn/v1",
    model: str = "Qwen/Qwen2.5-7B-Instruct",
    client_time: Optional[str] = None
) -> AIParseResult:
    """
    调用 LLM API 解析文本，提取任务信息
    """
    # 兼容 OpenAI 格式接口
    url = f"{base_url.rstrip('/')}/chat/completions"
    
    # 获取当前时间
    from datetime import datetime
    current_time_str = client_time or datetime.now().strftime("%Y-%m-%d %H:%M:%S")

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

    
    
    # 兼容 OpenAI 格式接口
    # 智能防止重复拼接 /chat/completions
    base_url = base_url.rstrip('/')
    if base_url.endswith("/chat/completions"):
        url = base_url
    else:
        url = f"{base_url}/chat/completions"
        
    print(f"🔗 LLM Request URL: {url}")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        }
        
        try:
            response = await client.post(url, json=payload, headers=headers)
            
            if response.status_code != 200:
                print(f"❌ LLM API Error Status: {response.status_code}")
                # print(f"❌ LLM API Error Body: {response.text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"请求失败 ({response.status_code}) URL: {url} \n响应: {response.text[:200]}"
                )
            
            try:
                result = response.json()
            except json.JSONDecodeError:
                print(f"❌ Invalid JSON Response: {response.text}")
                raise HTTPException(
                    status_code=500, 
                    detail=f"解析失败 URL: {url} \n返回非 JSON 内容: {response.text[:100]}"
                )
            content = result["choices"][0]["message"]["content"]
            
            try:
                parsed = json.loads(content)
                tasks = [TaskItem(**task) for task in parsed.get("tasks", [])]
                return AIParseResult(tasks=tasks, summary=parsed.get("summary"))
            except (json.JSONDecodeError, KeyError):
                # 如果解析失败，返回原文作为单个任务
                return AIParseResult(
                    tasks=[TaskItem(title=text[:100], suggestion="无法完全解析，请检查原文")],
                    summary=None
                )
        except httpx.RequestError as e:
            raise HTTPException(status_code=500, detail=f"LLM 网络请求失败: {str(e)}")



def clean_json_string(s: str) -> str:
    """清理 JSON 字符串，移除 Markdown 代码块标记"""
    # 移除 ```json 和 ```
    if "```" in s:
        import re
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", s, re.DOTALL)
        if match:
            return match.group(1)
    return s.strip()


async def call_vision_api(
    image_path: Path,
    api_key: str,
    base_url: str = "https://api.siliconflow.cn/v1",
    model: str = "THUDM/GLM-4.1V-9B-Thinking"
) -> AIParseResult:
    """
    调用多模态模型进行图片解析
    """
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
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}},
                ],
            },
        ],
        "temperature": 0.2,
        # 注意：某些视觉模型不支持 response_format，已移除以提高兼容性
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        headers = {
            "Content-Type": "application/json",
        }
        # 只在 api_key 非空时添加 Authorization header
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        
        print(f"🔗 Vision Request URL: {url}")
        print(f"🔑 Vision API Key: {api_key[:20] if api_key else 'NONE'}...")
        print(f"🎨 Vision Model: {model}")
        
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            error_detail = f"视觉模型请求失败 ({response.status_code}): {response.text[:200]}"
            print(f"⚠️ {error_detail}")
            raise HTTPException(
                status_code=500,  # 始终使用 500，不传播外部 API 错误码
                detail=error_detail
            )

        result = response.json()
        content = result["choices"][0]["message"]["content"]

        try:
            # 清理 JSON 字符串 (移除 markdown 标记)
            cleaned_content = clean_json_string(content)
            parsed = json.loads(cleaned_content)
            tasks = [TaskItem(**task) for task in parsed.get("tasks", [])]
            return AIParseResult(tasks=tasks, summary=parsed.get("summary"))
        except (json.JSONDecodeError, KeyError):
            return AIParseResult(
                tasks=[TaskItem(title="无法解析图片内容", suggestion="请检查图片清晰度")],
                summary=None
            )


@app.get("/")
async def root():
    """健康检查接口"""
    return {"status": "ok", "message": "Project Flow API is running"}


@app.get("/api/health")
async def health_check():
    """详细健康检查"""
    return {
        "status": "healthy",
        "version": "1.1.0",
        "temp_dir": str(TEMP_DIR),
        "temp_files_count": len(list(TEMP_DIR.glob("*")))
    }


@app.get("/api/models")
async def get_models(
    x_device_id: str = Header(default="unknown", alias="X-Device-ID"),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """获取模型列表与剩余次数"""
    config = load_config()
    catalog = get_model_catalog()
    tier = current_user.tier.lower() if current_user and current_user.tier else "guest"
    today = datetime.now().strftime("%Y-%m-%d")

    if current_user:
        text_used = current_user.text_daily_usage if current_user.last_usage_date == today else 0
        vision_used = current_user.vision_daily_usage if current_user.last_usage_date == today else 0
        free_text_limit = config.get("limits", {}).get("free_daily_limit", 10)
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
            items.append({
                "id": entry.get("id"),
                "name": entry.get("name") or entry.get("id"),
                "vendor": entry.get("vendor", "unknown"),
                "tier": entry.get("tier"),
                "tiers": entry.get("tiers"),
                "is_default": entry.get("is_default", False),
                "available": allowed,
                "tag": entry.get("tag"),
            })
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
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    # STT 配置（可选，优先使用后端 config.json）
    x_stt_base_url: Optional[str] = Header(None, alias="X-STT-Base-Url"),
    x_stt_key: Optional[str] = Header(None, alias="X-STT-Key"),
    x_stt_model: Optional[str] = Header(None, alias="X-STT-Model"),
    # LLM 配置（可选，优先使用后端 config.json）
    x_llm_base_url: Optional[str] = Header(None, alias="X-LLM-Base-Url"),
    x_llm_key: Optional[str] = Header(None, alias="X-LLM-Key"),
    x_llm_model: Optional[str] = Header(None, alias="X-LLM-Model"),
    # 其他
    x_device_id: str = Header(default="unknown", alias="X-Device-ID"),
    x_client_time: Optional[str] = Header(None, alias="X-Client-Time"),
    # 用户认证
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    音频处理主接口 (支持自定义服务商)
    
    Headers:
    - X-STT-Base-Url: STT 服务商 API 地址
    - X-STT-Key: STT API Key
    - X-STT-Model: STT 模型名称
    - X-LLM-Base-Url: LLM 服务商 API 地址
    - X-LLM-Key: LLM API Key
    - X-LLM-Model: LLM 模型名称
    """
    # 生成唯一文件名
    file_ext = Path(file.filename).suffix or ".aac"
    temp_filename = f"{uuid.uuid4()}{file_ext}"
    temp_path = TEMP_DIR / temp_filename
    
    try:
        # 1. 保存音频文件到临时目录
        # 安全检查：限制文件大小 (10MB)
        MAX_FILE_SIZE = 10 * 1024 * 1024
        content = await file.read()
        
        if len(content) > MAX_FILE_SIZE:
             raise HTTPException(
                status_code=413,
                detail="音频文件过大 (限制 10MB)",
                headers={"X-Maximum-Limit": "10MB"}
            )

        with open(temp_path, "wb") as f:
            f.write(content)
        print(f"📥 收到音频文件: {temp_filename}, 大小: {len(content)} bytes")
        
        # 2. 添加后台任务：在接口返回后删除临时文件
        background_tasks.add_task(delete_temp_file, temp_path)

        if not current_user:
            usage = await get_device_usage(x_device_id)
            if usage.stt_count >= 1:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "语音试用次数已用完，请登录继续使用。", "code": "STT_LIMIT_REACHED"},
                )
            if usage.text_count >= 3:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "文字模型次数已用完，请登录继续使用。", "code": "TEXT_LIMIT_REACHED"},
                )

        # 检查用户限流 (如果已登录)
        if current_user:
            await check_rate_limit(current_user)

        # 加载后端配置作为默认值
        catalog = get_model_catalog()
        user_tier = current_user.tier.lower() if current_user and current_user.tier else "free"
        stt_config = get_model_config_for_tier(user_tier, "stt")

        # STT 配置优先级：后端 config.json > Header 传入值
        final_stt_key = stt_config.get("api_key") or x_stt_key or ""
        final_stt_base_url = stt_config.get("base_url") or x_stt_base_url or "https://api.siliconflow.cn/v1"
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
        final_stt_model = requested_stt_model

        # 3. 调用 STT API
        raw_text = await call_stt_api(temp_path, final_stt_key, final_stt_base_url, final_stt_model)
        print(f"📝 STT 结果: {raw_text[:100]}...")
        
        if not raw_text.strip():
            return ProcessAudioResponse(
                success=False,
                raw_text="",
                error="语音识别结果为空，请重新录制"
            )

        if not current_user:
            await increment_device_usage(x_device_id, "stt")

        # 4. 调用 LLM API 解析任务
        # 根据用户等级获取模型配置
        user_tier = current_user.tier.lower() if current_user and current_user.tier else "free"
        llm_config = get_model_config_for_tier(user_tier, "llm")

        # LLM 配置优先级：后端 config.json (根据用户等级) > Header 传入值
        final_llm_key = llm_config.get("api_key") or x_llm_key or ""
        final_llm_base_url = llm_config.get("base_url") or x_llm_base_url or "https://api.siliconflow.cn/v1"
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
        final_llm_model = requested_llm_model
        
        # 传递客户端时间
        ai_result = await call_llm_api(raw_text, final_llm_key, final_llm_base_url, final_llm_model, client_time=x_client_time)
        print(f"🤖 LLM 解析完成，提取到 {len(ai_result.tasks)} 个任务")

        if current_user:
            await increment_user_usage(current_user.id, "text", is_vip_model=is_vip_model(llm_entry))
        else:
            await increment_device_usage(x_device_id, "text")
        
        # 5. 保存到数据库 (关联 User ID)
        ai_json = ai_result.model_dump_json()
        user_id = current_user.id if current_user else None
        record = await create_record(raw_text, ai_json, x_device_id, user_id=user_id)
        record_id = record.id
        
        return ProcessAudioResponse(
            success=True,
            raw_text=raw_text,
            ai_result=ai_result,
            record_id=record_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ 处理音频时出错: {e}")
        return ProcessAudioResponse(
            success=False,
            raw_text="",
            error=str(e)
        )


class ProcessTextRequest(BaseModel):
    text: str

@app.post("/api/process-text", response_model=ProcessAudioResponse)
async def process_text(
    request: ProcessTextRequest,
    # LLM 配置（可选，优先使用后端 config.json）
    x_llm_base_url: Optional[str] = Header(None, alias="X-LLM-Base-Url"),
    x_llm_key: Optional[str] = Header(None, alias="X-LLM-Key"),
    x_llm_model: Optional[str] = Header(None, alias="X-LLM-Model"),
    # 其他
    x_device_id: str = Header(default="unknown", alias="X-Device-ID"),
    x_client_time: Optional[str] = Header(None, alias="X-Client-Time"),
    # 用户认证
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    处理纯文本输入 (LLM 任务提取)
    """
    try:
        if not current_user:
            usage = await get_device_usage(x_device_id)
            if usage.text_count >= 3:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "文字模型次数已用完，请登录继续使用。", "code": "TEXT_LIMIT_REACHED"},
                )

        # 检查用户限流 (如果已登录)
        if current_user:
            await check_rate_limit(current_user)

        print(f"📝 收到文本输入: {request.text[:100]}...")
        
        # 加载后端配置并根据用户等级获取模型配置
        user_tier = current_user.tier.lower() if current_user and current_user.tier else "free"
        llm_config = get_model_config_for_tier(user_tier, "llm")

        # LLM 配置优先级：后端 config.json (根据用户等级) > Header 传入值
        final_llm_key = llm_config.get("api_key") or x_llm_key or ""
        final_llm_base_url = llm_config.get("base_url") or x_llm_base_url or "https://api.siliconflow.cn/v1"
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
        final_llm_model = requested_llm_model

        # 调用 LLM API 解析任务
        # 调用 LLM API 解析任务
        ai_result = await call_llm_api(request.text, final_llm_key, final_llm_base_url, final_llm_model, client_time=x_client_time)
        print(f"🤖 LLM 解析完成，提取到 {len(ai_result.tasks)} 个任务")

        if current_user:
            await increment_user_usage(current_user.id, "text", is_vip_model=is_vip_model(llm_entry))
        else:
            await increment_device_usage(x_device_id, "text")
        
        # 保存到数据库
        ai_json = ai_result.model_dump_json()
        user_id = current_user.id if current_user else None
        record = await create_record(request.text, ai_json, x_device_id, user_id=user_id)
        record_id = record.id
        
        return ProcessAudioResponse(
            success=True,
            raw_text=request.text,
            ai_result=ai_result,
            record_id=record_id
        )
        
    except Exception as e:
        print(f"❌ 处理文本时出错: {e}")
        return ProcessAudioResponse(
            success=False,
            raw_text=request.text,
            error=str(e)
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
    # Debug: Log authentication status
    auth_header = "present" if "authorization" in dict(file.__dict__).get("headers", {}) else "missing"
    print(f"🔑 Image upload auth check: user={'logged_in' if current_user else 'guest'}, user_id={current_user.id if current_user else 'N/A'}")
    
    if not current_user:
        return JSONResponse(
            status_code=403,
            content={"detail": "视觉模型需要登录后使用。", "code": "VISION_LOGIN_REQUIRED"},
        )

    today = datetime.now().strftime("%Y-%m-%d")
    vision_used = current_user.vision_daily_usage if current_user.last_usage_date == today else 0
    vision_limit = 10 if current_user.tier == "vip" else 1
    if vision_used >= vision_limit:
        return JSONResponse(
            status_code=403,
            content={"detail": "视觉模型次数已用完，请明天再试或升级 VIP。", "code": "VISION_LIMIT_REACHED"},
        )

    file_ext = Path(file.filename).suffix or ".jpg"
    temp_filename = f"{uuid.uuid4()}{file_ext}"
    temp_path = TEMP_IMAGE_DIR / temp_filename

    try:
        content = await file.read()
        with open(temp_path, "wb") as f:
            f.write(content)
        print(f"📥 收到图片文件: {temp_filename}, 大小: {len(content)} bytes")

        background_config = load_config()
        catalog = get_model_catalog()
        user_tier = current_user.tier if current_user else "free"

        # 1. 确定使用的模型 ID
        requested_vision_model = x_vision_model
        if not requested_vision_model:
            # 从默认配置中获取
            defaults = background_config.get("defaults", {})
            tier_defaults = defaults.get(user_tier, defaults.get("free", {}))
            requested_vision_model = tier_defaults.get("vision", "THUDM/GLM-4.1V-9B-Thinking")

        # 2. 查找模型定义
        vision_entry = find_model_entry(catalog, "vision", requested_vision_model)
        
        # 3. 确定 API Key 和 Base URL
        # 优先使用 Header 覆盖，否则使用模型对应的 Vendor 配置
        final_vision_key = x_vision_key or ""
        final_vision_base_url = x_vision_base_url or ""

        if vision_entry:
            vendor_name = vision_entry.get("vendor")
            if vendor_name:
                vendors_config = background_config.get("vendors", {})
                vendor_config = vendors_config.get(vendor_name, {})
                if not final_vision_key:
                    final_vision_key = vendor_config.get("api_key", "")
                if not final_vision_base_url:
                    final_vision_base_url = vendor_config.get("base_url", "")
        
        # 如果还是没有，回退到硬编码默认值 (兼容旧逻辑或测试)
        if not final_vision_base_url:
            final_vision_base_url = "https://api.siliconflow.cn/v1"

        # 4. 权限检查
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

        ai_result = await call_vision_api(
            temp_path,
            final_vision_key,
            final_vision_base_url,
            requested_vision_model,
        )
        print(f"🧠 Vision 解析完成，提取到 {len(ai_result.tasks)} 个任务")

        await increment_user_usage(current_user.id, "vision", is_vip_model=False)

        ai_json = ai_result.model_dump_json()
        record = await create_record("[image]", ai_json, x_device_id, user_id=current_user.id)

        return ProcessAudioResponse(
            success=True,
            raw_text="[image]",
            ai_result=ai_result,
            record_id=record.id,
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ 处理图片时出错: {e}")
        return ProcessAudioResponse(
            success=False,
            raw_text="[image]",
            error=str(e),
        )
    finally:
        try:
            delete_temp_file(temp_path)
        except Exception:
            pass


@app.get("/api/records")
async def get_records(
    device_id: Optional[str] = None,
    limit: int = 50
):
    """
    获取记录列表
    """
    if device_id:
        records = await get_records_by_device(device_id, limit)
    else:
        records = await get_all_records(limit)
    
    return {"records": records, "count": len(records)}


@app.post("/api/test-connection")
async def test_connection(
    # LLM 配置 (测试用)
    x_llm_base_url: str = Header(default="https://api.siliconflow.cn/v1", alias="X-LLM-Base-Url"),
    x_llm_key: str = Header(..., alias="X-LLM-Key"),
):
    """
    测试 LLM API 连接
    (简单测试模型列表接口，验证 Key 是否有效)
    """
    # 兼容 OpenAI 的 model list 接口
    url = f"{x_llm_base_url.rstrip('/')}/models"
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                url,
                headers={"Authorization": f"Bearer {x_llm_key}"}
            )
            if response.status_code == 200:
                return {"success": True, "message": "API Key 验证成功"}
            else:
                return {"success": False, "message": f"验证失败: {response.status_code} {response.text[:50]}"}
    except Exception as e:
        return {"success": False, "message": f"连接失败: {str(e)}"}


class AnalyzeTasksRequest(BaseModel):
    tasks: list
    period: str
    start_date: str
    end_date: str


@app.post("/api/analyze-tasks")
async def analyze_tasks(
    request: AnalyzeTasksRequest,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """AI-driven task analysis for VIP users"""
    if not current_user or current_user.tier.lower() != 'vip':
        return JSONResponse(
            status_code=403,
            content={"detail": "此功能仅对 VIP 用户开放", "code": "VIP_REQUIRED"},
        )
    
    llm_config = get_model_config_for_tier("vip", "llm")
    llm_key = llm_config.get("api_key")
    llm_base_url = llm_config.get("base_url") or "https://api.siliconflow.cn/v1"
    llm_model = llm_config.get("model") or "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B"
    
    from datetime import datetime
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    tasks_summary = "\n".join([
        f"- {t.get('title')} ({t.get('timestamp', 'N/A')}, {'✓' if t.get('completed') else '✗'})"
        for t in request.tasks
    ])
    
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
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        headers = {
            "Authorization": f"Bearer {llm_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": llm_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"分析这 {len(request.tasks)} 个任务"}
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        }
        
        try:
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail=f"LLM请求失败: {response.status_code}")
            
            result = response.json()
            content = result["choices"][0]["message"]["content"]
            
            try:
                parsed = json.loads(content)
                return parsed
            except json.JSONDecodeError:
                raise HTTPException(status_code=500, detail="无法解析AI响应")
        except httpx.RequestError as e:
            raise HTTPException(status_code=500, detail=f"网络请求失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
