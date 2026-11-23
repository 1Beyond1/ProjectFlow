"""
后端安全校验工具模块
- 出站 URL SSRF 防护（HTTPS 校验、端口白名单、禁止 userinfo/query/fragment、私网/保留 IP 拦截、DNS 解析校验）
- 连接层 IP 固定（PinnedNetworkBackend），彻底封堵 DNS Rebinding TOCTOU
- 敏感 URL 脱敏（日志打印防密码泄露）
- 客户端时间格式严格校验（防 Prompt 注入）
- 上传文件分块限流与图片魔数校验
"""
import asyncio
import ipaddress
import os
import re
import socket
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urlsplit, urlunsplit

import httpcore
import httpx
from fastapi import HTTPException, UploadFile


BLOCKED_HOSTNAMES = {"localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"}
BLOCKED_HOST_SUFFIXES = (".localhost", ".local", ".internal", ".home.arpa")
CLIENT_TIME_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$")
DEFAULT_ALLOWED_OUTBOUND_PORTS = {443}


@dataclass(frozen=True)
class ValidatedOutboundTarget:
    """已校验的出站 HTTPS 目标（包含固定公网 IP，供连接层绑定防 DNS Rebinding）"""
    base_url: str
    hostname: str
    port: int
    resolved_ips: tuple[str, ...]


def get_allowed_outbound_ports() -> set[int]:
    """获取允许出站端口白名单（默认仅 443，可通过环境变量 ALLOWED_OUTBOUND_PORTS 覆盖）"""
    raw = os.getenv("ALLOWED_OUTBOUND_PORTS", "").strip()
    if not raw:
        return set(DEFAULT_ALLOWED_OUTBOUND_PORTS)
    ports: set[int] = set()
    for part in raw.split(","):
        cleaned = part.strip()
        if not cleaned:
            continue
        try:
            port_num = int(cleaned)
        except ValueError:
            continue
        if 1 <= port_num <= 65535:
            ports.add(port_num)
    return ports or set(DEFAULT_ALLOWED_OUTBOUND_PORTS)


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


async def validate_outbound_url(raw_url: str) -> ValidatedOutboundTarget:
    """
    严格校验客户端传入的外部服务 Base URL，防止 SSRF 与 DNS Rebinding：
    1. 仅允许 https:// 协议，拒绝控制字符/空白
    2. 禁止 netloc 出现 '@'（拦截 user:pass@ 与空 userinfo）
    3. 禁止 ?query 与 #fragment
    4. 显式校验端口（拦截 :0 等非法端口），且端口必须在允许白名单内（默认仅 443）
    5. 禁止 localhost / 内网域名后缀
    6. 对字面量 IP 或 DNS 解析出的全部 IP 进行公网地址校验并返回固定 IP 列表
    """
    url = (raw_url or "").strip()
    if not url or len(url) > 2048 or any(ord(ch) <= 0x20 or ord(ch) == 0x7F for ch in url):
        raise HTTPException(status_code=400, detail="无效的外部服务地址")

    try:
        parsed = urlsplit(url)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的外部服务地址")

    if parsed.scheme.lower() != "https":
        raise HTTPException(status_code=400, detail="外部服务地址仅允许使用 HTTPS 协议")

    if "@" in parsed.netloc or parsed.username is not None or parsed.password is not None:
        raise HTTPException(status_code=400, detail="外部服务地址不允许包含认证凭据")

    if parsed.query or parsed.fragment or "?" in url or "#" in url:
        raise HTTPException(status_code=400, detail="外部服务地址不允许包含查询参数或锚点")

    hostname = (parsed.hostname or "").strip().lower().rstrip(".")
    if not hostname:
        raise HTTPException(status_code=400, detail="外部服务地址缺少有效主机名")

    if hostname in BLOCKED_HOSTNAMES or any(hostname.endswith(suffix) for suffix in BLOCKED_HOST_SUFFIXES):
        raise HTTPException(status_code=400, detail="禁止访问本地或内网服务地址")

    try:
        raw_port = parsed.port
    except ValueError:
        raise HTTPException(status_code=400, detail="外部服务端口无效")

    port = 443 if raw_port is None else raw_port
    if port < 1 or port > 65535 or port not in get_allowed_outbound_ports():
        raise HTTPException(status_code=400, detail="外部服务端口不在允许范围内")

    normalized_url = url.rstrip("/")

    # 1. 若主机名本身是 IP 字面量，直接校验
    try:
        ip_literal = ipaddress.ip_address(hostname)
    except ValueError:
        ip_literal = None

    if ip_literal is not None:
        if not _is_public_ip(ip_literal):
            raise HTTPException(status_code=400, detail="禁止访问私网、回环或保留 IP 地址")
        return ValidatedOutboundTarget(
            base_url=normalized_url,
            hostname=hostname,
            port=port,
            resolved_ips=(str(ip_literal),),
        )

    # 2. 解析域名对应的全部 IP 并逐一校验
    loop = asyncio.get_running_loop()
    try:
        addr_infos = await loop.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except OSError:
        raise HTTPException(status_code=400, detail="外部服务域名无法解析")

    if not addr_infos:
        raise HTTPException(status_code=400, detail="外部服务域名无法解析")

    resolved_ips: list[str] = []
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
        canonical_ip = str(resolved_ip)
        if canonical_ip not in resolved_ips:
            resolved_ips.append(canonical_ip)

    if not resolved_ips:
        raise HTTPException(status_code=400, detail="外部服务域名无法解析")

    return ValidatedOutboundTarget(
        base_url=normalized_url,
        hostname=hostname,
        port=port,
        resolved_ips=tuple(resolved_ips),
    )


class PinnedNetworkBackend(httpcore.AsyncNetworkBackend):
    """
    连接层 IP 固定后端：
    - 强制把 TCP 连接直接打到预先校验过的公网 IP，彻底杜绝 DNS Rebinding 二次解析
    - 保留 URL 原始域名供 httpcore 发送 Host 头与执行 TLS SNI 证书校验
    """

    def __init__(
        self,
        pinned_host: str,
        pinned_ips: tuple[str, ...],
        allowed_port: int,
        inner: Optional[httpcore.AsyncNetworkBackend] = None,
    ):
        self._pinned_host = pinned_host.strip().lower().rstrip(".")
        self._pinned_ips = pinned_ips
        self._allowed_port = allowed_port
        self._inner = inner or httpcore._backends.auto.AutoBackend()

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: Optional[float] = None,
        local_address: Optional[str] = None,
        socket_options=None,
    ):
        normalized = host.strip().lower().rstrip(".")
        if normalized != self._pinned_host or port != self._allowed_port:
            raise httpcore.ConnectError("禁止连接到未校验的目标主机或端口")

        last_exc: Optional[Exception] = None
        for ip_addr in self._pinned_ips:
            if not _is_public_ip(ipaddress.ip_address(ip_addr)):
                raise httpcore.ConnectError("禁止连接到非公网 IP 地址")
            try:
                return await self._inner.connect_tcp(
                    host=ip_addr,
                    port=port,
                    timeout=timeout,
                    local_address=local_address,
                    socket_options=socket_options,
                )
            except Exception as exc:
                last_exc = exc

        if last_exc is not None:
            raise last_exc
        raise httpcore.ConnectError("无法连接到目标服务")

    async def connect_unix_socket(
        self,
        path: str,
        timeout: Optional[float] = None,
        socket_options=None,
    ):
        raise httpcore.ConnectError("禁止连接本地 Unix Socket")

    async def sleep(self, seconds: float) -> None:
        await self._inner.sleep(seconds)


def build_pinned_transport(target: ValidatedOutboundTarget) -> httpx.AsyncHTTPTransport:
    """构造绑定已校验公网 IP 的 httpx AsyncHTTPTransport（保留原始域名 TLS SNI 与 Host 头）"""
    transport = httpx.AsyncHTTPTransport()
    transport._pool._network_backend = PinnedNetworkBackend(
        pinned_host=target.hostname,
        pinned_ips=target.resolved_ips,
        allowed_port=target.port,
        inner=transport._pool._network_backend,
    )
    return transport


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
