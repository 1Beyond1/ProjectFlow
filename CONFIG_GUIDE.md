# Project Flow 后端配置热切换指南

## 概述

本指南介绍如何通过修改服务器上的 `config.json` 文件，无需重启服务即可动态切换 API 服务商、模型和密钥。

---

## 配置文件位置

```bash
/www/wwwroot/project-flow/backend/config.json
```

---

## 配置文件结构

```json
{
    "stt": {
        "base_url": "https://api.siliconflow.cn/v1",
        "model": "SenseVoiceSmall",
        "api_key": "sk-your-stt-key"
    },
    "llm": {
        "base_url": "https://api.siliconflow.cn/v1",
        "model": "Qwen/Qwen2.5-7B-Instruct",
        "api_key": "sk-your-llm-key"
    },
    "llm_vip": {
        "base_url": "https://api.siliconflow.cn/v1",
        "model": "deepseek-ai/DeepSeek-V3",
        "api_key": "sk-your-vip-key"
    },
    "jwt": {
        "secret_key": "your-super-secret-key-change-in-production",
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

### 1. 通过 SSH 或宝塔面板进入服务器

```bash
ssh root@your-server-ip
cd /www/wwwroot/project-flow/backend
```

### 2. 编辑配置文件

```bash
nano config.json
# 或使用 vim
vim config.json
```

### 3. 修改配置

**切换 LLM 模型示例：**
```json
"llm": {
    "model": "deepseek-ai/DeepSeek-R1"
}
```

**切换 API 服务商示例：**
```json
"llm": {
    "base_url": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "api_key": "sk-openai-key"
}
```

### 4. 保存文件

配置会在**下一次 API 请求时自动生效**，无需重启服务。

---

## 支持的 API 服务商

| 服务商 | Base URL | 常用模型 |
|--------|----------|----------|
| SiliconFlow | `https://api.siliconflow.cn/v1` | Qwen2.5-7B, DeepSeek-V3 |
| DeepSeek | `https://api.deepseek.com/v1` | deepseek-chat |
| OpenAI | `https://api.openai.com/v1` | gpt-4o-mini |
| Moonshot | `https://api.moonshot.cn/v1` | moonshot-v1-8k |

---

## 注意事项

1. **JSON 格式**：确保配置文件是有效的 JSON 格式，否则会回退到默认配置
2. **安全**：生产环境务必修改 `jwt.secret_key`
3. **密钥保护**：请勿将真实 API Key 提交到代码仓库
