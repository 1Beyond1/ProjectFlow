# Project Flow 后端配置热切换指南

## 概述

本指南介绍如何通过修改服务器上的 `backend/config.json`（v2 多服务商/多模型结构）或环境变量，无需重启服务即可动态切换 API 服务商、模型和配额策略。

---

## 配置文件位置与环境变量

- 默认配置文件路径：`backend/config.json`（模板见 `backend/config.example.json`）
- 推荐通过环境变量注入敏感密钥与运维配置：
  - `JWT_SECRET_KEY`：JWT 签名密钥（**优先于 `config.json` 中的 `jwt.secret_key`**，必须不少于 32 位且不能使用占位符）
  - `DATABASE_URL`：异步数据库连接串（默认 SQLite，生产建议 `mysql+aiomysql://flow_user:...@host:3306/project_flow`）
  - `REDIS_URL`：Redis 连接串（如 `redis://:password@127.0.0.1:6379/0`）
  - `CORS_ALLOW_ORIGINS`：允许跨域的前端源列表，逗号分隔（如 `https://flow.example.com,http://localhost:8081`）

---

## 配置文件结构（v2）

```json
{
    "vendors": {
        "SiliconFlow": {
            "base_url": "https://api.siliconflow.cn/v1",
            "api_key": "sk-your-siliconflow-key"
        }
    },
    "defaults": {
        "free": {
            "llm": "Qwen/Qwen3-8B",
            "vision": "THUDM/GLM-4.1V-9B-Thinking",
            "stt": "FunAudioLLM/SenseVoiceSmall"
        },
        "vip": {
            "llm": "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
            "vision": "THUDM/GLM-4.1V-9B-Thinking",
            "stt": "FunAudioLLM/SenseVoiceSmall"
        }
    },
    "models": {
        "llm": [
            {
                "id": "Qwen/Qwen3-8B",
                "name": "Qwen3-8B",
                "vendor": "SiliconFlow",
                "tier": "free",
                "is_default": true
            },
            {
                "id": "Qwen/Qwen2.5-7B-Instruct",
                "name": "Qwen2.5-7B-Instruct",
                "vendor": "SiliconFlow",
                "tier": "free",
                "tag": "快速模型"
            },
            {
                "id": "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
                "name": "DeepSeek-R1-0528-Qwen3-8B",
                "vendor": "SiliconFlow",
                "tier": "vip"
            }
        ],
        "vision": [
            {
                "id": "THUDM/GLM-4.1V-9B-Thinking",
                "name": "GLM-4.1V-9B-Thinking",
                "vendor": "SiliconFlow",
                "tiers": ["free", "vip"],
                "is_default": true
            }
        ],
        "stt": [
            {
                "id": "FunAudioLLM/SenseVoiceSmall",
                "name": "SenseVoiceSmall",
                "vendor": "SiliconFlow",
                "tiers": ["free", "vip"],
                "is_default": true
            }
        ]
    },
    "jwt": {
        "secret_key": "使用 openssl rand -hex 32 生成的 64 位随机密钥",
        "algorithm": "HS256",
        "access_token_expire_minutes": 60,
        "refresh_token_expire_days": 30
    },
    "limits": {
        "free_daily_limit": 10
    }
}
```

---

## 热切换操作步骤

### 1. 进入后端目录并编辑 `config.json`

```bash
cd /opt/1panel/apps/project-flow/backend
vim config.json
```

### 2. 切换默认模型示例

只需修改 `defaults` 中对应等级的模型 ID（确保该模型已在 `models` 中定义）：

```json
"defaults": {
    "free": {
        "llm": "Qwen/Qwen2.5-7B-Instruct",
        "vision": "THUDM/GLM-4.1V-9B-Thinking",
        "stt": "FunAudioLLM/SenseVoiceSmall"
    }
}
```

### 3. 新增其他兼容 OpenAI 的服务商示例

先在 `vendors` 中新增服务商，再在 `models` 中挂载对应模型并指向新服务商：

```json
"vendors": {
    "SiliconFlow": {
        "base_url": "https://api.siliconflow.cn/v1",
        "api_key": "sk-siliconflow-key"
    },
    "DeepSeek": {
        "base_url": "https://api.deepseek.com/v1",
        "api_key": "sk-deepseek-key"
    }
}
```

### 4. 保存生效

配置会在**下一次 API 请求时自动热加载**，无需重启容器或 Uvicorn 进程。

---

## 安全与容错说明

1. **强 JWT 密钥（Fail-Closed）**：系统已彻底移除硬编码弱默认密钥。启动、签发与验签均会拒绝空值、占位符（如 `YOUR_JWT_SECRET_KEY_HERE`）和少于 32 字符的弱密钥；推荐直接通过环境变量 `JWT_SECRET_KEY` 注入。
2. **热重载快照保护**：若编辑 `config.json` 时出现 JSON 语法错误，服务端会保留上一份有效配置快照，不会回退到弱默认密钥；若首次启动即缺失有效配置与 `JWT_SECRET_KEY`，服务会直接 Fail-Closed 拒绝启动。
3. **服务端 Key 隔离与 SSRF 防护**：服务端配置的 `api_key` 只会发往服务端 `vendors` 对应的 `base_url`，绝不会发往客户端 Header 传入的任意地址；客户端自带 Key 覆盖 `Base-Url` 或调用 `/api/test-connection` 时仅允许公网 `https://` 地址。
4. **密钥保护**：`backend/config.json` 已加入 `.gitignore` 与 `backend/.dockerignore`，请勿将真实密钥提交到代码仓库。
