"""
认证路由 - 用户注册、登录、刷新 Token
"""
from fastapi import APIRouter, HTTPException, status, Depends, Header
from pydantic import BaseModel
from typing import Optional

from database import create_user, get_user_by_username, get_user_by_uid, update_user_token, get_user_by_id, update_user_device_id
from auth import hash_password, verify_password, create_access_token, create_refresh_token, get_current_user_required, decode_token


router = APIRouter(prefix="/auth", tags=["认证"])


# ==================== 请求/响应模型 ====================

class RegisterRequest(BaseModel):
    """注册请求"""
    username: str
    password: str
    password_confirm: str
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None


class LoginRequest(BaseModel):
    """登录请求 (支持用户名或 UID)"""
    username: Optional[str] = None
    uid: Optional[int] = None
    password: str


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


# ==================== 路由 ====================

@router.post("/register", response_model=TokenResponse)
async def register(
    request: RegisterRequest,
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID")
):
    """
    用户注册
    - 用户名唯一
    - 密码需确认
    - UID 从 10000 开始自动分配
    """
    # 验证密码
    if request.password != request.password_confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="两次输入的密码不一致"
        )
    
    if len(request.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密码长度不能少于6位"
        )
    
    # 检查用户名是否已存在
    existing = await get_user_by_username(request.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已被注册"
        )
    
    # 创建用户
    password_hash = hash_password(request.password)
    user = await create_user(
        username=request.username,
        password_hash=password_hash,
        nickname=request.nickname,
        avatar_url=request.avatar_url,
        device_id=x_device_id
    )
    
    # 生成 Token
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    
    # 保存 refresh token
    await update_user_token(user.id, refresh_token)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            "uid": user.uid,
            "username": user.username,
            "nickname": user.nickname,
            "avatar_url": user.avatar_url,
            "tier": user.tier,
        }
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID")
):
    """
    用户登录
    - 支持用户名或 UID 登录
    """
    user = None
    
    # 通过用户名查找
    if request.username:
        user = await get_user_by_username(request.username)
    # 通过 UID 查找
    elif request.uid:
        user = await get_user_by_uid(request.uid)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请提供用户名或 UID"
        )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在"
        )
    
    # 封禁检查
    if user.is_banned == 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被封禁"
        )

    # 验证密码
    if not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="密码错误"
        )
    
    # 生成 Token
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    
    # 更新 refresh token
    await update_user_token(user.id, refresh_token)

    # 记录当前设备 ID
    if x_device_id:
        await update_user_device_id(user.id, x_device_id)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            "uid": user.uid,
            "username": user.username,
            "nickname": user.nickname,
            "avatar_url": user.avatar_url,
            "tier": user.tier,
        }
    )


@router.get("/me", response_model=UserInfoResponse)
async def get_current_user_info(user=Depends(get_current_user_required)):
    """获取当前用户信息"""
    return UserInfoResponse(
        uid=user.uid,
        username=user.username,
        nickname=user.nickname,
        avatar_url=user.avatar_url,
        tier=user.tier,
        daily_usage=user.daily_usage,
    )


class RefreshRequest(BaseModel):
    """刷新 Token 请求"""
    refresh_token: str


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: RefreshRequest):
    """
    使用 Refresh Token 获取新的 Access Token
    """
    payload = decode_token(request.refresh_token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的刷新令牌"
        )
    
    # 确认是 refresh token 类型
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="令牌类型错误"
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="令牌无效"
        )
    
    user = await get_user_by_id(int(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在"
        )
    
    # 检查账户是否被封禁
    if user.is_banned == 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被封禁"
        )
    
    # 生成新的 access token
    new_access_token = create_access_token({"sub": str(user.id)})
    # 可选：同时刷新 refresh token (滚动刷新)
    new_refresh_token = create_refresh_token({"sub": str(user.id)})
    await update_user_token(user.id, new_refresh_token)
    
    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        user={
            "uid": user.uid,
            "username": user.username,
            "nickname": user.nickname,
            "avatar_url": user.avatar_url,
            "tier": user.tier,
        }
    )
