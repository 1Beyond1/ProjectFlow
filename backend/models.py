"""
SQLAlchemy ORM model definitions.
Supports SQLite (dev) and MySQL (prod).
"""
from datetime import datetime
from typing import Optional, List
import enum

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.ext.mutable import MutableDict

from types_local import JSONEncodedDict


class Base(DeclarativeBase):
    """SQLAlchemy base class."""
    pass


class UserTier(str, enum.Enum):
    """User tier enum."""
    FREE = "free"
    VIP = "vip"


class User(Base):
    """User model."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    uid: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    nickname: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    avatar_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    tier: Mapped[UserTier] = mapped_column(
        SQLEnum(UserTier, values_callable=lambda enum_cls: [e.value for e in enum_cls], native_enum=False),
        default=UserTier.FREE,
    )
    daily_usage: Mapped[int] = mapped_column(Integer, default=0)
    text_daily_usage: Mapped[int] = mapped_column(Integer, default=0)
    vip_daily_usage: Mapped[int] = mapped_column(Integer, default=0)
    vision_daily_usage: Mapped[int] = mapped_column(Integer, default=0)
    last_usage_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    user_token: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    is_banned: Mapped[int] = mapped_column(Integer, default=0)
    last_device_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Pomodoro stats (30-day JSON + totals)
    pomo_daily_json: Mapped[Optional[dict]] = mapped_column(
        MutableDict.as_mutable(JSONEncodedDict),
        nullable=True,
    )
    pomo_total_completed: Mapped[int] = mapped_column(Integer, default=0)
    pomo_total_interrupted: Mapped[int] = mapped_column(Integer, default=0)
    pomo_total_focus_sec: Mapped[int] = mapped_column(Integer, default=0)
    pomo_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    records: Mapped[List["Record"]] = relationship(
        "Record",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Record(Base):
    """Task record model."""
    __tablename__ = "records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    raw_text: Mapped[str] = mapped_column(Text)
    ai_json: Mapped[str] = mapped_column(Text)
    device_id: Mapped[str] = mapped_column(String(100), index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    user: Mapped[Optional["User"]] = relationship("User", back_populates="records")


class SystemConfig(Base):
    """System config model (optional)."""
    __tablename__ = "system_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DeviceUsage(Base):
    """Daily usage tracking for guest devices."""
    __tablename__ = "device_usage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(100), index=True)
    usage_date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    text_count: Mapped[int] = mapped_column(Integer, default=0)
    stt_count: Mapped[int] = mapped_column(Integer, default=0)
    vision_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
