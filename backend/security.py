"""
后端安全校验工具模块
- 出站 URL SSRF 防护（HTTPS 校验、私网/保留地址拦截、DNS 解析校验）
- 敏感 URL 脱敏（日志打印防密码泄露）
- 客户端时间格式严格校验（防 Prompt 注入）
- 上传文件分块限流与图片魔数校验
"""
import asyncio
import ipaddress
import re
import socket
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse, urlsplit, urlunsplit

from fastapi import HTTPException, UploadFile


BLOCKED_HOSTNAMES = {"localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"}
BLOCKED_HOST_SUFFIXES = (".localhost", ".local", ".internal", ".home.arpa")
CLIENT_TIME_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$")


def _is_public_ip(ip_obj: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """检查 IP 是否为公网可路由地址（拒绝私网、回环、链路本地、保留、多播、未指定等）"""
    if isinstance(ip_obj, ipaddress.IPv6Address) and ip_obj.ipv4_mapped is not None:
        return _is_public_ip(ip_obj.ipv4_mapped)

    if (
        ip_obj.is_private
        or ip_obj.is_loopback
        or ip_obj.is_link_local
        or ip_obj.is_multicast
        or ip_obj.is_reserved
        or ip_obj.is_unspecified
        or not ip_obj.is_global
    ):
        return False
    return True


async def validate_outbound_url(raw_url: str) -> str:
    """
    严格校验客户端传入的外部服务 Base URL，防止 SSRF：
    1. 仅允许 https:// 协议
    2. 禁止 URL 中携带用户名/密码
    3. 禁止 localhost / 内网域名后缀
    4. 对字面量 IP 及 DNS 解析出的全部 IP 进行公网地址校验
    """
    url = (raw_url or "").strip()
    if not url or len(url) > 2048:
        raise HTTPException(status_code=400, detail="无效的外部服务地址")

    try:
        parsed = urlparse(url)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的外部服务地址")

    if parsed.scheme.lower() != "https":
        raise HTTPException(status_code=400, detail="外部服务地址仅允许使用 HTTPS 协议")

    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="外部服务地址不允许包含认证凭据")

    hostname = (parsed.hostname or "").strip().lower().rstrip(".")
    if not hostname:
        raise HTTPException(status_code=400, detail="外部服务地址缺少有效主机名")

    if hostname in BLOCKED_HOSTNAMES or any(hostname.endswith(suffix) for suffix in BLOCKED_HOST_SUFFIXES):
        raise HTTPException(status_code=400, detail="禁止访问本地或内网服务地址")

    try:
        port = parsed.port or 443
    except ValueError:
        raise HTTPException(status_code=400, detail="外部服务端口无效")

    if port < 1 or port > 65535:
        raise HTTPException(status_code=400, detail="外部服务端口无效")

    # 1. 若主机名本身是 IP 字面量，直接校验
    try:
        ip_literal = ipaddress.ip_address(hostname)
    except ValueError:
        ip_literal = None

    if ip_literal is not None:
        if not _is_public_ip(ip_literal):
            raise HTTPException(status_code=400, detail="禁止访问私网、回环或保留 IP 地址")
        return url.rstrip("/")

    # 2. 解析域名对应的全部 IP 并逐一校验
    loop = asyncio.get_running_loop()
    try:
        addr_infos = await loop.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except OSError:
        raise HTTPException(status_code=400, detail="外部服务域名无法解析")

    if not addr_infos:
        raise HTTPException(status_code=400, detail="外部服务域名无法解析")

    for info in addr_infos:
        sockaddr = info[4]
        if not sockaddr:
            continue
        ip_str = sockaddr[0].split("%")[0]
        try:
            resolved_ip = ipaddress.ip_address(ip_str)
        except ValueError:
            raise HTTPException(status_code=400, detail="外部服务解析地址无效")
        if not _is_public_ip(resolved_ip):
            raise HTTPException(status_code=400, detail="禁止访问解析到私网或保留 IP 的外部地址")

    return url.rstrip("/")


def mask_url_password(raw_url: str) -> str:
    """脱敏连接串中的密码，避免日志泄露凭据"""
    if not raw_url:
        return ""
    try:
        parts = urlsplit(raw_url)
        if not parts.password:
            return raw_url
        host = parts.hostname or ""
        if ":" in host and not host.startswith("["):
            host = f"[{host}]"
        user = parts.username or ""
        auth = f"{user}:***@" if user else ":***@"
        port = f":{parts.port}" if parts.port is not None else ""
        netloc = f"{auth}{host}{port}"
        return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
    except Exception:
        return "***"


def validate_client_time(client_time: Optional[str]) -> Optional[str]:
    """严格校验 X-Client-Time 为 YYYY-MM-DD HH:MM:SS 格式，防止 Prompt 注入"""
    if client_time is None:
        return None
    cleaned = client_time.strip()
    if not cleaned:
        return None
    if not CLIENT_TIME_PATTERN.fullmatch(cleaned):
        raise HTTPException(
            status_code=400,
            detail="无效的 X-Client-Time 格式，需为 YYYY-MM-DD HH:MM:SS",
        )
    normalized = cleaned.replace("T", " ")
    try:
        dt = datetime.strptime(normalized, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="无效的 X-Client-Time 日期时间",
        )
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def detect_image_mime(header_bytes: bytes) -> Optional[str]:
    """根据文件魔数识别图片真实 MIME 类型"""
    if header_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if header_bytes.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(header_bytes) >= 12 and header_bytes[:4] == b"RIFF" and header_bytes[8:12] == b"WEBP":
        return "image/webp"
    return None


async def save_upload_file_limited(
    upload_file: UploadFile,
    dest_path: Path,
    max_bytes: int,
    too_large_detail: str,
    chunk_size: int = 64 * 1024,
) -> tuple[int, bytes]:
    """
    分块流式保存上传文件，超限时立即中断并删除临时文件，返回 (总字节数, 头部字节用于魔数校验)
    """
    total_size = 0
    header_buf = bytearray()
    try:
        with open(dest_path, "wb") as out_file:
            while True:
                chunk = await upload_file.read(chunk_size)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > max_bytes:
                    out_file.close()
                    if dest_path.exists():
                        dest_path.unlink(missing_ok=True)
                    limit_mb = max(1, max_bytes // (1024 * 1024))
                    raise HTTPException(
                        status_code=413,
                        detail=too_large_detail,
                        headers={"X-Maximum-Limit": f"{limit_mb}MB"},
                    )
                if len(header_buf) < 32:
                    header_buf.extend(chunk[: 32 - len(header_buf)])
                out_file.write(chunk)
    except HTTPException:
        raise
    except Exception:
        if dest_path.exists():
            dest_path.unlink(missing_ok=True)
        raise

    if total_size == 0:
        if dest_path.exists():
            dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="上传文件不能为空")

    return total_size, bytes(header_buf)
