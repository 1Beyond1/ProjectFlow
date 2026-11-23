"""
认证路由 - 用户注册、登录、登出、刷新 Token
"""
import hmac
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from auth import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user_required,
    hash_password,
    hash_token,
    verify_password,
)
from database import (
    create_user,
    get_user_by_id,
    get_user_by_uid,
    get_user_by_username,
    update_user_device_id,
    update_user_token,
)


router = APIRouter(prefix="/auth", tags=["认证"])


# ==================== 请求/响应模型 ====================

class RegisterRequest(BaseModel):
    """注册请求"""
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)
    password_confirm: str = Field(..., min_length=6, max_length=128)
    nickname: Optional[str] = Field(None, max_length=50)
    avatar_url: Optional[str] = Field(None, max_length=255)


class LoginRequest(BaseModel):
    """登录请求 (支持用户名或 UID)"""
    username: Optional[str] = Field(None, max_length=50)
    uid: Optional[int] = None
    password: str = Field(..., min_length=1, max_length=128)


class TokenResponse(BaseModel):
    """Token 响应"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class UserInfoResponse(BaseModel):
    """用户信息响应"""
    uid: int
    username: str
    nickname: Optional[str]
    avatar_url: Optional[str]
    tier: str
    daily_usage: int
    is_banned: int = 0


class RefreshRequest(BaseModel):
    """刷新 Token 请求"""
    refresh_token: str = Field(..., min_length=1, max_length=4096)


def _serialize_user(user) -> dict:
    tier_value = user.tier.value if hasattr(user.tier, "value") else str(user.tier)
    return {
        "uid": user.uid,
        "username": user.username,
        "nickname": user.nickname,
        "avatar_url": user.avatar_url,
        "tier": tier_value,
        "is_banned": int(getattr(user, "is_banned", 0) or 0),
    }


# ==================== 路由 ====================

@router.post("/register", response_model=TokenResponse)
async def register(
    request: RegisterRequest,
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
):
    """
    用户注册
    - 用户名唯一
    - 密码需确认
    - UID 从 10000 开始自动分配
    """
    username = request.username.strip()
    if len(username) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名长度不能少于2位",
        )

    if request.password != request.password_confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="两次输入的密码不一致",
        )

    if len(request.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密码长度不能少于6位",
        )

    if len(request.password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密码长度不能超过72字节",
        )

    existing = await get_user_by_username(username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已被注册",
        )

    password_hash = hash_password(request.password)
    try:
        user = await create_user(
            username=username,
            password_hash=password_hash,
            nickname=request.nickname,
            avatar_url=request.avatar_url,
            device_id=x_device_id,
        )
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已被注册",
        )

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    await update_user_token(user.id, hash_token(refresh_token))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_serialize_user(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
):
    """
    用户登录
    - 支持用户名或 UID 登录
    - 先验密再查封禁，统一凭据错误提示防止用户名/封禁状态枚举
    """
    user = None

    if request.username and request.username.strip():
        user = await get_user_by_username(request.username.strip())
    elif request.uid is not None:
        user = await get_user_by_uid(request.uid)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请提供用户名或 UID",
        )

    # 先验密（用户不存在时执行虚拟 bcrypt 对比，防时序与枚举）
    candidate_hash = user.password_hash if user else DUMMY_PASSWORD_HASH
    password_ok = verify_password(request.password, candidate_hash)
    if not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )

    # 密码校验通过后再检查封禁状态，避免泄露封禁状态
    if user.is_banned == 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被封禁",
        )

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    await update_user_token(user.id, hash_token(refresh_token))

    if x_device_id:
        await update_user_device_id(user.id, x_device_id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_serialize_user(user),
    )


@router.get("/me", response_model=UserInfoResponse)
async def get_current_user_info(user=Depends(get_current_user_required)):
    """获取当前用户信息"""
    tier_value = user.tier.value if hasattr(user.tier, "value") else str(user.tier)
    return UserInfoResponse(
        uid=user.uid,
        username=user.username,
        nickname=user.nickname,
        avatar_url=user.avatar_url,
        tier=tier_value,
        daily_usage=user.daily_usage,
        is_banned=int(getattr(user, "is_banned", 0) or 0),
    )


@router.post("/logout")
async def logout(user=Depends(get_current_user_required)):
    """退出登录并立即吊销当前用户的 Refresh Token"""
    await update_user_token(user.id, None)
    return {"success": True, "message": "已退出登录"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: RefreshRequest):
    """
    使用 Refresh Token 轮换并获取新的 Access Token 与 Refresh Token
    - 校验 token 类型与 jti
    - 严格比对数据库中的 SHA-256 哈希，不匹配视为重放攻击并立即吊销
    """
    payload = decode_token(request.refresh_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的刷新令牌",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="令牌类型错误",
        )

    raw_user_id = payload.get("sub")
    token_jti = payload.get("jti")
    if not raw_user_id or not token_jti:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="令牌无效",
        )

    try:
        user_id = int(raw_user_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="令牌无效",
        )

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
        )

    if user.is_banned == 1:
        await update_user_token(user.id, None)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被封禁",
        )

    incoming_hash = hash_token(request.refresh_token)
    stored_hash = user.user_token or ""
    if not stored_hash or not hmac.compare_digest(stored_hash, incoming_hash):
        # 检测到重放或已吊销令牌，立即清空服务端 Refresh Token 吊销整条会话链
        await update_user_token(user.id, None)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="刷新令牌已失效，请重新登录",
        )

    new_access_token = create_access_token({"sub": str(user.id)})
    new_refresh_token = create_refresh_token({"sub": str(user.id)})
    await update_user_token(user.id, hash_token(new_refresh_token))

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        user=_serialize_user(user),
    )
