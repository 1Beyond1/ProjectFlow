#!/bin/bash
# Project Flow - 一键环境初始化脚本
# 使用方法: bash setup.sh

set -e

echo "🚀 Project Flow 环境初始化开始..."
echo "=================================="

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ==================== 后端初始化 ====================
echo ""
echo "📦 [1/4] 初始化后端环境..."
echo "----------------------------"

cd "$SCRIPT_DIR/backend"

# 检查 Python 版本
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ 错误: 未找到 Python，请先安装 Python 3.10+"
    exit 1
fi

echo "✅ 使用 Python: $($PYTHON_CMD --version)"

# 创建虚拟环境
if [ ! -d "venv" ]; then
    echo "📁 创建 Python 虚拟环境..."
    $PYTHON_CMD -m venv venv
else
    echo "📁 虚拟环境已存在，跳过创建"
fi

# 激活虚拟环境并安装依赖
echo "📥 安装后端依赖..."
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
    # Windows
    source venv/Scripts/activate
else
    # Linux/macOS
    source venv/bin/activate
fi

pip install --upgrade pip -q
pip install -r requirements.txt -q

echo "✅ 后端依赖安装完成"

# 创建临时目录
mkdir -p temp_audio temp_images
echo "✅ 临时目录已创建 (temp_audio, temp_images)"

# ==================== 数据库初始化 ====================
echo ""
echo "📦 [2/4] 初始化数据库与配置文件..."
echo "----------------------------"

# 初始化数据库表结构
$PYTHON_CMD -c "
import asyncio
from database import init_db
asyncio.run(init_db())
print('✅ 数据库表结构已创建')
"

# 生成高强度随机 JWT 密钥（64 位十六进制，至少 32 字符）
if command -v openssl &> /dev/null; then
    JWT_SECRET="$(openssl rand -hex 32)"
else
    JWT_SECRET="$($PYTHON_CMD -c 'import secrets; print(secrets.token_hex(32))')"
fi

# 创建默认 v2 配置文件（与 backend/config.example.json 结构保持一致）
if [ ! -f "config.json" ]; then
    cat <<EOF > config.json
{
    "vendors": {
        "SiliconFlow": {
            "base_url": "https://api.siliconflow.cn/v1",
            "api_key": "YOUR_SILICONFLOW_API_KEY_HERE"
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
            },
            {
                "id": "THUDM/GLM-Z1-9B-0414",
                "name": "GLM-Z1-9B-0414",
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
        "secret_key": "${JWT_SECRET}",
        "algorithm": "HS256",
        "access_token_expire_minutes": 60,
        "refresh_token_expire_days": 30
    },
    "limits": {
        "free_daily_limit": 10
    }
}
EOF
    echo "✅ 默认 v2 配置文件已创建（已自动生成 64 位随机 JWT 密钥，请按需填入 vendors.SiliconFlow.api_key）"
else
    echo "📁 配置文件已存在，跳过创建"
fi

# ==================== 前端初始化 ====================
echo ""
echo "📦 [3/4] 初始化前端环境..."
echo "----------------------------"

cd "$SCRIPT_DIR"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js 18+"
    exit 1
fi

echo "✅ 使用 Node.js: $(node --version)"

# 安装前端依赖
if [ -f "frontend/package.json" ]; then
    cd frontend
    if [ ! -d "node_modules" ]; then
        echo "📥 安装前端依赖..."
        npm install -q
    else
        echo "📁 前端依赖已存在，跳过安装"
    fi
    echo "✅ 前端依赖准备完成"
else
    echo "❌ 错误: 未找到 frontend/package.json"
    exit 1
fi

# ==================== 完成 ====================
echo ""
echo "=================================="
echo "🎉 环境初始化完成！"
echo ""
echo "📝 启动说明:"
echo ""
echo "  【启动后端】"
echo "  cd backend"
echo "  source venv/bin/activate  # Windows: venv\\Scripts\\activate"
echo "  uvicorn main:app --reload --host 0.0.0.0 --port 8000"
echo ""
echo "  【启动前端】"
echo "  cd frontend"
echo "  npx expo start"
echo ""
echo "📚 重要文档:"
echo "  - CONFIG_GUIDE.md      配置热切换指南"
echo "  - CLOUD_DEPLOYMENT.md  云部署教程"
echo ""
echo "=================================="
