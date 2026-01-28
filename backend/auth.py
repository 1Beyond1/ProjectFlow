"""
认证与授权模块
- JWT Token 生成与验证
- 密码哈希与验证
- 用户分级限流
"""
import os
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from database import get_user_by_id, get_user_by_username, get_user_by_uid, check_user_limit, update_user_usage


# ==================== 配置加载 ====================

CONFIG_PATH = Path(__file__).parent / "config.json"


def load_config() -> dict:
    """热加载配置文件"""
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    except Exception as e:
        print(f"⚠️ 配置文件加载失败: {e}")
        return {
            "jwt": {
                "secret_key": "fallback-secret-key",
                "algorithm": "HS256",
                "access_token_expire_minutes": 60,
            }
        }


# ==================== 密码处理 ====================

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """密码加盐哈希"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)


# ==================== JWT Token ====================

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建访问令牌"""
    config = load_config()
    jwt_config = config.get("jwt", {})
    
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(
        minutes=jwt_config.get("access_token_expire_minutes", 60)
    ))
    to_encode.update({"exp": expire, "type": "access"})
    
    return jwt.encode(
        to_encode,
        jwt_config.get("secret_key", "fallback-secret-key"),
        algorithm=jwt_config.get("algorithm", "HS256")
    )


def create_refresh_token(data: dict) -> str:
    """创建刷新令牌"""
    config = load_config()
    jwt_config = config.get("jwt", {})
    
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(
        days=jwt_config.get("refresh_token_expire_days", 30)
    )
    to_encode.update({"exp": expire, "type": "refresh"})
    
    return jwt.encode(
        to_encode,
        jwt_config.get("secret_key", "fallback-secret-key"),
        algorithm=jwt_config.get("algorithm", "HS256")
    )


def decode_token(token: str) -> Optional[dict]:
    """解码 Token"""
    config = load_config()
    jwt_config = config.get("jwt", {})
    
    try:
        payload = jwt.decode(
            token,
            jwt_config.get("secret_key", "fallback-secret-key"),
            algorithms=[jwt_config.get("algorithm", "HS256")]
        )
        return payload
    except JWTError as e:
        print(f"⚠️ Token 解码失败: {e}")
        return None


# ==================== 依赖注入 ====================

security = HTTPBearer(auto_error=False)


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """可选的用户认证 (未登录返回 None)"""
    if not credentials:
        return None
    
    payload = decode_token(credentials.credentials)
    if not payload:
        # 如果提供了 Token 但无效（过期或错误），应返回 401 以触发前端刷新
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="令牌中缺少用户信息",
        )
    
    user = await get_user_by_id(int(user_id))
    return user


async def get_current_user_required(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """必须的用户认证"""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="令牌中缺少用户信息",
        )
    
    user = await get_user_by_id(int(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
        )
    
    return user


async def check_rate_limit(user):
    """检查用户限流"""
    if not user:
        # 未登录用户，允许有限访问（后续可调整）
        return True
    
    allowed, remaining = await check_user_limit(user.id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"已达今日使用上限。升级 VIP 解锁无限次数！",
        )
    
    # 更新使用次数
    await update_user_usage(user.id)
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

