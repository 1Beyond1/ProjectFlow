"""
认证与授权模块
- JWT Token 生成与验证（强密钥校验、类型防混淆、Refresh Token JTI + SHA-256 哈希）
- 密码哈希与验证（原生 bcrypt，兼容既有 $2b$ 哈希）
- 用户封禁 Fail-Closed 校验与原子配额预扣
"""
import copy
import hashlib
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from database import get_user_by_id, reserve_user_quota


# ==================== 配置加载与强密钥校验 ====================

CONFIG_PATH = Path(__file__).parent / "config.json"
MIN_JWT_SECRET_LENGTH = 32
ALLOWED_JWT_ALGORITHMS = {"HS256", "HS384", "HS512"}
PLACEHOLDER_SECRET_MARKERS = (
    "your_jwt_secret_key_here",
    "your-super-secret-key",
    "fallback-secret-key",
    "change-this-in-production",
    "change_this_in_production",
    "placeholder",
    "changeme",
)

_last_valid_config: Optional[dict] = None


def reset_config_cache() -> None:
    """清空配置快照缓存（主要用于测试）"""
    global _last_valid_config
    _last_valid_config = None


def validate_jwt_secret(secret: Optional[str]) -> str:
    """校验 JWT 密钥强度，拒绝空值、占位符与过短密钥"""
    if not isinstance(secret, str):
        raise RuntimeError("JWT 密钥未配置或类型无效")
    cleaned = secret.strip()
    if len(cleaned) < MIN_JWT_SECRET_LENGTH:
        raise RuntimeError(f"JWT 密钥长度不足，至少需要 {MIN_JWT_SECRET_LENGTH} 个字符")
    lowered = cleaned.lower()
    if any(marker in lowered for marker in PLACEHOLDER_SECRET_MARKERS):
        raise RuntimeError("JWT 密钥不能使用默认占位符，请配置高强度随机密钥")
    if len(set(cleaned)) < 4:
        raise RuntimeError("JWT 密钥熵值过低，请配置高强度随机密钥")
    return cleaned


def _get_valid_env_jwt_secret() -> Optional[str]:
    """优先读取环境变量 JWT_SECRET_KEY；未设置或空白字符串视为未覆盖，非空但无效则立即报错"""
    raw = os.getenv("JWT_SECRET_KEY")
    if raw is None or not raw.strip():
        return None
    return validate_jwt_secret(raw)


def load_config() -> dict:
    """
    热加载配置文件：
    - 读取成功时更新最近有效配置快照
    - 读取/解析失败时回退到上一份有效配置快照
    - 若无有效快照：当且仅当环境变量 JWT_SECRET_KEY 有效时返回空配置字典，否则 Fail-Closed 抛出异常
    """
    global _last_valid_config
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8-sig") as f:
            parsed = json.load(f)
        if not isinstance(parsed, dict):
            raise ValueError("配置文件根节点必须为 JSON 对象")
        _last_valid_config = copy.deepcopy(parsed)
        return parsed
    except Exception as e:
        print(f"⚠️ 配置文件加载失败: {type(e).__name__}")
        if _last_valid_config is not None:
            return copy.deepcopy(_last_valid_config)
        # 无本地配置文件时，若环境变量提供了有效 JWT 密钥，允许以纯环境变量模式运行
        if _get_valid_env_jwt_secret() is not None:
            return {}
        raise RuntimeError("无法加载有效配置文件且未配置有效的 JWT_SECRET_KEY") from e


def get_jwt_settings(config: Optional[dict] = None) -> tuple[str, str, dict]:
    """获取并严格校验 JWT 密钥与算法"""
    env_secret = _get_valid_env_jwt_secret()
    cfg = config if config is not None else load_config()
    jwt_config = cfg.get("jwt", {}) if isinstance(cfg, dict) else {}

    secret = env_secret if env_secret is not None else validate_jwt_secret(jwt_config.get("secret_key"))
    algorithm = str(jwt_config.get("algorithm", "HS256")).upper()
    if algorithm not in ALLOWED_JWT_ALGORITHMS:
        raise RuntimeError(f"不支持的 JWT 签名算法: {algorithm}")

    return secret, algorithm, jwt_config


def validate_jwt_config() -> None:
    """启动时校验 JWT 配置完整性（Fail-Closed）"""
    get_jwt_settings()


# ==================== 密码与令牌哈希处理 ====================

# 预计算虚拟哈希，用于登录用户不存在时的等时对比防枚举
DUMMY_PASSWORD_HASH = bcrypt.hashpw(b"dummy-password-for-timing-protection", bcrypt.gensalt()).decode("utf-8")


def hash_password(password: str) -> str:
    """密码加盐哈希（原生 bcrypt，输出标准 $2b$ 格式）"""
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        raise ValueError("密码长度不能超过 72 字节")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码（兼容既有 passlib 生成的 $2b$/$2a$ bcrypt 哈希）"""
    if not plain_password or not hashed_password:
        return False
    try:
        plain_bytes = plain_password.encode("utf-8")
        if len(plain_bytes) > 72:
            return False
        return bcrypt.checkpw(plain_bytes, hashed_password.encode("utf-8"))
    except Exception:
        return False


def hash_token(token: str) -> str:
    """对 Refresh Token 计算 SHA-256 哈希后落库，避免明文存储"""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ==================== JWT Token ====================

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建访问令牌"""
    secret, algorithm, jwt_config = get_jwt_settings()

    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=int(jwt_config.get("access_token_expire_minutes", 60)))
    )
    to_encode.update({"exp": expire, "type": "access"})

    return jwt.encode(to_encode, secret, algorithm=algorithm)


def create_refresh_token(data: dict) -> str:
    """创建刷新令牌（携带唯一 jti 支持轮换与防重放）"""
    secret, algorithm, jwt_config = get_jwt_settings()

    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        days=int(jwt_config.get("refresh_token_expire_days", 30))
    )
    to_encode.update({"exp": expire, "type": "refresh", "jti": uuid.uuid4().hex})

    return jwt.encode(to_encode, secret, algorithm=algorithm)


def decode_token(token: str) -> Optional[dict]:
    """解码并验签 Token；密钥配置非法时 Fail-Closed 抛出异常"""
    secret, algorithm, _ = get_jwt_settings()

    try:
        payload = jwt.decode(token, secret, algorithms=[algorithm])
        return payload
    except JWTError as e:
        print(f"⚠️ Token 解码失败: {type(e).__name__}")
        return None


# ==================== 依赖注入 ====================

security = HTTPBearer(auto_error=False)


def _extract_access_user_id(token: str) -> int:
    """解码访问令牌，强制校验 type == 'access' 并提取整数 user_id"""
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="令牌类型错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raw_user_id = payload.get("sub")
    if not raw_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="令牌中缺少用户信息",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return int(raw_user_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="令牌用户信息无效",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _ensure_not_banned(user) -> None:
    """直接依据数据库状态执行封禁 Fail-Closed 校验"""
    if user and getattr(user, "is_banned", 0) == 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被封禁",
        )


def _ensure_active_session(user) -> None:
    """确保会话未被登出或重放吊销（user_token 清空后旧 access_token 立即失效）"""
    if not getattr(user, "user_token", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录会话已失效，请重新登录",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """可选的用户认证 (未提供凭证返回 None；提供凭证时强制校验 access 类型、封禁状态与会话有效性)"""
    if not credentials:
        return None

    user_id = _extract_access_user_id(credentials.credentials)
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
            headers={"WWW-Authenticate": "Bearer"},
        )

    _ensure_not_banned(user)
    _ensure_active_session(user)
    return user


async def get_current_user_required(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """必须的用户认证（强制校验 access 类型、封禁状态与会话有效性）"""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = _extract_access_user_id(credentials.credentials)
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
            headers={"WWW-Authenticate": "Bearer"},
        )

    _ensure_not_banned(user)
    _ensure_active_session(user)
    return user


async def check_rate_limit(user, is_vip_model: bool = False):
    """原子检查并预扣用户文本配额"""
    if not user:
        return True

    config = load_config()
    free_limit = int(config.get("limits", {}).get("free_daily_limit", 10))
    allowed, _remaining = await reserve_user_quota(
        user.id,
        "text",
        is_vip_model=is_vip_model,
        free_daily_limit=free_limit,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="已达今日使用上限。升级 VIP 解锁无限次数！",
        )
    return True


def get_vendor_config(vendor_name: str) -> dict:
    """获取服务商配置（base_url 和 api_key）"""
    config = load_config()
    vendors = config.get("vendors", {})
    return vendors.get(vendor_name, {})


def find_model_by_id(model_id: str, model_type: str) -> dict:
    """根据模型 ID 和类型查找模型定义"""
    config = load_config()
    models = config.get("models", {}).get(model_type, [])
    for model in models:
        if model.get("id") == model_id:
            return model
    return {}


def get_default_model_for_tier(tier: str, model_type: str) -> str:
    """根据用户等级和模型类型获取默认模型 ID"""
    config = load_config()
    defaults = config.get("defaults", {})
    tier_defaults = defaults.get(tier, defaults.get("free", {}))
    return tier_defaults.get(model_type, "")


def get_model_config_for_tier(tier: str, model_type: str) -> dict:
    """
    根据用户等级和模型类型获取完整配置（包含 vendor 的 base_url 和 api_key）
    返回格式: {"base_url": "...", "api_key": "...", "model": "..."}
    """
    model_id = get_default_model_for_tier(tier, model_type)
    if not model_id:
        return {}

    model_entry = find_model_by_id(model_id, model_type)
    if not model_entry:
        return {}

    vendor_name = model_entry.get("vendor")
    if not vendor_name:
        return {}

    vendor_config = get_vendor_config(vendor_name)
    return {
        "base_url": vendor_config.get("base_url", ""),
        "api_key": vendor_config.get("api_key", ""),
        "model": model_id,
    }
