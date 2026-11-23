"""P0 安全修复回归测试（BE-01 ~ BE-05）"""
import asyncio
import json
import socket

import httpx
import pytest

import auth as auth_module
import database as database_module
import main as main_module
import security as security_module
from tests.conftest import (
    FailingRedis,
    TEST_JWT_SECRET,
    TEST_SERVER_API_KEY,
    make_async_client,
    register_user,
    set_user_banned,
)


VALID_JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"


class _DummyResponse:
    def __init__(self, status_code: int = 200, json_data: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._json_data = json_data
        self.text = text

    def json(self):
        if self._json_data is None:
            raise ValueError("Not JSON")
        return self._json_data


# ==================== P0 BE-01: SSRF 与 Vision API Key 窃取防护 ====================

def test_be01_process_image_ignores_client_base_url_without_client_key(isolated_env, monkeypatch):
    captured = {}

    class SpyAsyncClient:
        def __init__(self, *args, **kwargs):
            captured["follow_redirects"] = kwargs.get("follow_redirects")

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, **kwargs):
            captured["url"] = url
            captured["headers"] = kwargs.get("headers", {})
            return _DummyResponse(
                200,
                {
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps({"tasks": [{"title": "测试任务"}], "summary": "ok"})
                            }
                        }
                    ]
                },
            )

    monkeypatch.setattr(main_module.httpx, "AsyncClient", SpyAsyncClient)

    async def _run():
        async with make_async_client() as client:
            auth_data = await register_user(client, "alice")
            resp = await client.post(
                "/api/process-image",
                files={"file": ("photo.jpg", VALID_JPEG_BYTES, "image/jpeg")},
                headers={
                    "Authorization": f"Bearer {auth_data['access_token']}",
                    # 攻击者未传自有 X-Vision-Key，企图把服务端 API Key 重定向到恶意地址
                    "X-Vision-Base-Url": "https://evil-attacker.example/v1",
                },
            )
            assert resp.status_code == 200, resp.text
            assert captured["url"] == "https://api.siliconflow.cn/v1/chat/completions"
            assert captured["headers"]["Authorization"] == f"Bearer {TEST_SERVER_API_KEY}"
            assert captured["follow_redirects"] is False

    asyncio.run(_run())


def test_be01_process_image_byok_blocks_ssrf_urls(isolated_env, monkeypatch):
    async def fake_getaddrinfo(host, port, *args, **kwargs):
        if host == "rebind.example":
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))]
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))]

    async def _run():
        loop = asyncio.get_running_loop()
        monkeypatch.setattr(loop, "getaddrinfo", fake_getaddrinfo)

        async with make_async_client() as client:
            auth_data = await register_user(client, "bob")
            bad_urls = [
                "http://api.openai.com/v1",
                "https://127.0.0.1/v1",
                "https://169.254.169.254/latest/meta-data",
                "https://10.0.0.5/v1",
                "https://localhost/v1",
                "https://rebind.example/v1",
            ]
            for bad_url in bad_urls:
                resp = await client.post(
                    "/api/process-image",
                    files={"file": ("photo.jpg", VALID_JPEG_BYTES, "image/jpeg")},
                    headers={
                        "Authorization": f"Bearer {auth_data['access_token']}",
                        "X-Vision-Key": "sk-client-own-key",
                        "X-Vision-Base-Url": bad_url,
                    },
                )
                assert resp.status_code == 400, f"Expected 400 for {bad_url}, got {resp.status_code}"

    asyncio.run(_run())


def test_be01_test_connection_requires_auth_blocks_ssrf_and_sanitizes(isolated_env, monkeypatch):
    captured = {}

    class SpyErrorClient:
        def __init__(self, *args, **kwargs):
            captured["follow_redirects"] = kwargs.get("follow_redirects")

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url, **kwargs):
            return _DummyResponse(500, text="INTERNAL_UPSTREAM_SECRET_TRACE_XYZ")

    async def fake_getaddrinfo(host, port, *args, **kwargs):
        if host == "internal.attacker.test":
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.10", port))]
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))]

    monkeypatch.setattr(main_module.httpx, "AsyncClient", SpyErrorClient)

    async def _run():
        loop = asyncio.get_running_loop()
        monkeypatch.setattr(loop, "getaddrinfo", fake_getaddrinfo)

        async with make_async_client() as client:
            # 1. 未登录必须返回 401
            unauth = await client.post(
                "/api/test-connection",
                headers={"X-LLM-Key": "sk-test", "X-LLM-Base-Url": "https://api.siliconflow.cn/v1"},
            )
            assert unauth.status_code == 401

            auth_data = await register_user(client, "charlie")
            auth_headers = {"Authorization": f"Bearer {auth_data['access_token']}"}

            # 2. SSRF 地址必须返回 400
            for bad_url in [
                "http://127.0.0.1:6379",
                "https://169.254.169.254/latest",
                "https://internal.attacker.test/v1",
            ]:
                resp = await client.post(
                    "/api/test-connection",
                    headers={**auth_headers, "X-LLM-Key": "sk-test", "X-LLM-Base-Url": bad_url},
                )
                assert resp.status_code == 400

            # 3. 合法公网 HTTPS 地址：禁用重定向且不回显上游原始响应体
            ok_req = await client.post(
                "/api/test-connection",
                headers={
                    **auth_headers,
                    "X-LLM-Key": "sk-test",
                    "X-LLM-Base-Url": "https://api.siliconflow.cn/v1",
                },
            )
            assert ok_req.status_code == 200
            body = ok_req.json()
            assert body["success"] is False
            assert "INTERNAL_UPSTREAM_SECRET_TRACE_XYZ" not in body["message"]
            assert captured["follow_redirects"] is False

    asyncio.run(_run())


def test_be01_upstream_helpers_disable_redirects_and_sanitize_errors(tmp_path, monkeypatch):
    seen_flags = []

    class ErrorClient:
        def __init__(self, *args, **kwargs):
            seen_flags.append(kwargs.get("follow_redirects"))

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, **kwargs):
            return _DummyResponse(500, text="SENSITIVE_UPSTREAM_BODY_999")

    monkeypatch.setattr(main_module.httpx, "AsyncClient", ErrorClient)
    dummy_file = tmp_path / "sample.bin"
    dummy_file.write_bytes(VALID_JPEG_BYTES)

    async def _run():
        with pytest.raises(main_module.HTTPException) as exc_stt:
            await main_module.call_stt_api(dummy_file, "sk-secret", "https://api.siliconflow.cn/v1")
        assert "SENSITIVE_UPSTREAM_BODY_999" not in str(exc_stt.value.detail)

        with pytest.raises(main_module.HTTPException) as exc_llm:
            await main_module.call_llm_api("hello", "sk-secret", "https://api.siliconflow.cn/v1")
        assert "SENSITIVE_UPSTREAM_BODY_999" not in str(exc_llm.value.detail)

        with pytest.raises(main_module.HTTPException) as exc_vis:
            await main_module.call_vision_api(dummy_file, "sk-secret", "https://api.siliconflow.cn/v1")
        assert "SENSITIVE_UPSTREAM_BODY_999" not in str(exc_vis.value.detail)

        assert seen_flags == [False, False, False]

    asyncio.run(_run())


def test_be01_process_text_never_sends_server_key_to_client_base_url(isolated_env, monkeypatch):
    captured = {}

    class SpyTextClient:
        def __init__(self, *args, **kwargs):
            captured["follow_redirects"] = kwargs.get("follow_redirects")

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, **kwargs):
            captured["url"] = url
            captured["headers"] = kwargs.get("headers", {})
            return _DummyResponse(
                200,
                {"choices": [{"message": {"content": json.dumps({"tasks": [{"title": "ok"}], "summary": "ok"})}}]},
            )

    monkeypatch.setattr(main_module.httpx, "AsyncClient", SpyTextClient)

    async def _run():
        async with make_async_client() as client:
            auth_data = await register_user(client, "text_ssrf_user")
            resp = await client.post(
                "/api/process-text",
                json={"text": "明天早上9点开会"},
                headers={
                    "Authorization": f"Bearer {auth_data['access_token']}",
                    "X-LLM-Base-Url": "https://attacker.example/v1",
                },
            )
            assert resp.status_code == 200
            assert captured["url"] == "https://api.siliconflow.cn/v1/chat/completions"
            assert captured["headers"]["Authorization"] == f"Bearer {TEST_SERVER_API_KEY}"
            assert captured["follow_redirects"] is False

    asyncio.run(_run())


def test_be03_lifespan_fails_closed_on_placeholder_secret(tmp_path, monkeypatch):
    bad_cfg = tmp_path / "placeholder_cfg.json"
    bad_cfg.write_text(json.dumps({"jwt": {"secret_key": "YOUR_JWT_SECRET_KEY_HERE"}}), encoding="utf-8")
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    monkeypatch.setattr(auth_module, "CONFIG_PATH", bad_cfg)
    auth_module.reset_config_cache()

    async def _run():
        with pytest.raises(RuntimeError):
            async with main_module.lifespan(main_module.app):
                pass

    asyncio.run(_run())


# ==================== P0 BE-02: /api/records 强制鉴权与数据隔离 ====================

def test_be02_records_auth_isolation_and_limit_bounds(isolated_env):
    async def _run():
        async with make_async_client() as client:
            # 1. 未认证返回 401
            resp_unauth = await client.get("/api/records")
            assert resp_unauth.status_code == 401

            # 2. 注册两位用户并分别写入记录
            user_a = await register_user(client, "user_a")
            user_b = await register_user(client, "user_b")
            db_a = await database_module.get_user_by_username("user_a")
            db_b = await database_module.get_user_by_username("user_b")

            await database_module.create_record("secret_a", "{}", "dev-a", user_id=db_a.id)
            await database_module.create_record("secret_b", "{}", "dev-b", user_id=db_b.id)
            await database_module.create_record("guest_orphan", "{}", "dev-guest", user_id=None)

            # 3. User A 即使尝试传 User B 的 device_id 也只能看到自己的记录
            resp_a = await client.get(
                "/api/records?device_id=dev-b&limit=50",
                headers={"Authorization": f"Bearer {user_a['access_token']}"},
            )
            assert resp_a.status_code == 200
            data_a = resp_a.json()
            assert data_a["count"] == 1
            assert [r["raw_text"] for r in data_a["records"]] == ["secret_a"]

            # 4. limit 越界校验
            headers_a = {"Authorization": f"Bearer {user_a['access_token']}"}
            assert (await client.get("/api/records?limit=0", headers=headers_a)).status_code == 422
            assert (await client.get("/api/records?limit=101", headers=headers_a)).status_code == 422
            assert (await client.get("/api/records?limit=10", headers=headers_a)).status_code == 200

    asyncio.run(_run())


# ==================== P0 BE-03: 弱 JWT 密钥拒绝与热重载安全回退 ====================

def test_be03_rejects_weak_and_placeholder_jwt_secrets(tmp_path, monkeypatch):
    bad_secrets = [
        "",
        "fallback-secret-key",
        "YOUR_JWT_SECRET_KEY_HERE",
        "your-super-secret-key-change-in-production",
        "too-short-secret-key-1234567890",  # 31 chars
        "a" * 40,  # low entropy
    ]
    for secret in bad_secrets:
        with pytest.raises(RuntimeError):
            auth_module.validate_jwt_secret(secret)

    # 环境变量优先于 config.json
    bad_cfg = tmp_path / "bad_config.json"
    bad_cfg.write_text(json.dumps({"jwt": {"secret_key": "YOUR_JWT_SECRET_KEY_HERE"}}), encoding="utf-8")
    monkeypatch.setattr(auth_module, "CONFIG_PATH", bad_cfg)
    auth_module.reset_config_cache()
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError):
        auth_module.create_access_token({"sub": "1"})

    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT_SECRET)
    token = auth_module.create_access_token({"sub": "1"})
    payload = auth_module.decode_token(token)
    assert payload is not None and payload["sub"] == "1"

    # 配置热重载：损坏配置时保留上一份有效配置快照
    good_cfg = tmp_path / "hot_config.json"
    good_cfg.write_text(
        json.dumps({"jwt": {"secret_key": TEST_JWT_SECRET}, "limits": {"free_daily_limit": 7}}),
        encoding="utf-8",
    )
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    monkeypatch.setattr(auth_module, "CONFIG_PATH", good_cfg)
    auth_module.reset_config_cache()
    assert auth_module.load_config()["limits"]["free_daily_limit"] == 7

    # 写入非法 JSON -> 保留上一份有效快照
    good_cfg.write_text("{broken json", encoding="utf-8")
    assert auth_module.load_config()["limits"]["free_daily_limit"] == 7

    # 无历史快照且无环境变量 -> Fail-Closed 报错
    auth_module.reset_config_cache()
    with pytest.raises(RuntimeError):
        auth_module.load_config()


# ==================== P0 BE-04: JWT 类型混淆防护与 Refresh 吊销/轮换 ====================

def test_be04_jwt_type_confusion_and_refresh_rotation_replay_logout(isolated_env):
    async def _run():
        async with make_async_client() as client:
            auth_data = await register_user(client, "dave")
            access_1 = auth_data["access_token"]
            refresh_1 = auth_data["refresh_token"]

            # 1. Refresh Token 不能当作 Access Token 访问业务接口
            for path in ["/auth/me", "/api/records", "/api/models"]:
                resp = await client.get(path, headers={"Authorization": f"Bearer {refresh_1}"})
                assert resp.status_code == 401, f"Refresh token should fail on {path}"

            # 2. Refresh Token 含 jti，且数据库仅存 SHA-256 哈希
            payload_r1 = auth_module.decode_token(refresh_1)
            assert payload_r1 and payload_r1.get("type") == "refresh" and payload_r1.get("jti")
            db_user = await database_module.get_user_by_username("dave")
            assert db_user.user_token == auth_module.hash_token(refresh_1)
            assert db_user.user_token != refresh_1

            # 3. 正常轮换签发 R2
            resp_rot = await client.post("/auth/refresh", json={"refresh_token": refresh_1})
            assert resp_rot.status_code == 200
            refresh_2 = resp_rot.json()["refresh_token"]
            assert refresh_2 != refresh_1

            # 4. 重放旧 Refresh Token R1 -> 401 且立即吊销整条会话（R2 也立即失效）
            resp_replay = await client.post("/auth/refresh", json={"refresh_token": refresh_1})
            assert resp_replay.status_code == 401
            db_user_after = await database_module.get_user_by_username("dave")
            assert db_user_after.user_token is None

            resp_r2_after_replay = await client.post("/auth/refresh", json={"refresh_token": refresh_2})
            assert resp_r2_after_replay.status_code == 401

            # 5. 重新登录 -> POST /auth/logout 吊销 Refresh Token
            login_resp = await client.post("/auth/login", json={"username": "dave", "password": "Secret123!"})
            assert login_resp.status_code == 200
            access_3 = login_resp.json()["access_token"]
            refresh_3 = login_resp.json()["refresh_token"]

            logout_resp = await client.post("/auth/logout", headers={"Authorization": f"Bearer {access_3}"})
            assert logout_resp.status_code == 200
            assert (await client.post("/auth/refresh", json={"refresh_token": refresh_3})).status_code == 401

    asyncio.run(_run())


# ==================== P0 BE-05: 封禁 Fail-Closed、原子同步与 403 CORS ====================

def test_be05_ban_fail_closed_when_redis_unavailable_and_cors_on_403(isolated_env):
    async def _run():
        async with make_async_client() as client:
            auth_data = await register_user(client, "eve")
            token = auth_data["access_token"]

            await set_user_banned("eve", 1)

            # 1. 模拟 Redis 完全宕机，封禁用户依然全部返回 403 且携带 CORS 头
            main_module.app.state.redis = FailingRedis()
            headers = {
                "Authorization": f"Bearer {token}",
                "Origin": "http://localhost:8081",
            }
            for method, path, extra in [
                ("GET", "/auth/me", {}),
                ("GET", "/api/records", {}),
                ("GET", "/api/models", {}),
                ("POST", "/api/process-text", {"json": {"text": "明天开会"}}),
            ]:
                resp = await client.request(method, path, headers=headers, **extra)
                assert resp.status_code == 403, f"Banned user must get 403 on {path}"
                assert resp.headers.get("access-control-allow-origin") == "http://localhost:8081"

            # 2. 验证 Redis 原子同步使用临时 Key + RENAME（无先 delete 主键空窗）
            spy_redis = isolated_env["redis"]
            spy_redis.ops.clear()
            await main_module.sync_banned_users_once(spy_redis)

            sadd_ops = [op for op in spy_redis.ops if op[0] == "sadd"]
            rename_ops = [op for op in spy_redis.ops if op[0] == "rename"]
            delete_main_ops = [
                op for op in spy_redis.ops if op[0] == "delete" and main_module.REDIS_BANNED_USERS_KEY in op[1:]
            ]
            assert len(sadd_ops) == 1 and ":tmp:" in sadd_ops[0][1]
            assert len(rename_ops) == 1 and rename_ops[0][2] == main_module.REDIS_BANNED_USERS_KEY
            assert len(delete_main_ops) == 0

            # 3. 当 Redis 命中封禁缓存时，403 中间件响应同样携带 CORS 头
            main_module.app.state.redis = spy_redis
            resp_cached = await client.get("/auth/me", headers=headers)
            assert resp_cached.status_code == 403
            assert resp_cached.headers.get("access-control-allow-origin") == "http://localhost:8081"

    asyncio.run(_run())
