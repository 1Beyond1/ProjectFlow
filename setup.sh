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
    echo "❌ 错误: 未找到 Python，请先安装 Python 3.9+"
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
mkdir -p temp_audio
echo "✅ 临时目录已创建"

# ==================== 数据库初始化 ====================
echo ""
echo "📦 [2/4] 初始化数据库..."
echo "----------------------------"

# 初始化数据库表结构
$PYTHON_CMD -c "
import asyncio
from database import init_db
asyncio.run(init_db())
print('✅ 数据库表结构已创建')
"

# 创建默认配置文件
if [ ! -f "config.json" ]; then
    echo '{
    "stt": {
        "base_url": "https://api.siliconflow.cn/v1",
        "model": "SenseVoiceSmall",
        "api_key": ""
    },
    "llm": {
        "base_url": "https://api.siliconflow.cn/v1",
        "model": "Qwen/Qwen2.5-7B-Instruct",
        "api_key": ""
    },
    "llm_vip": {
        "base_url": "https://api.siliconflow.cn/v1",
        "model": "deepseek-ai/DeepSeek-V3",
        "api_key": ""
    },
    "jwt": {
        "secret_key": "change-this-in-production-'$(openssl rand -hex 32)'",
        "algorithm": "HS256",
        "access_token_expire_minutes": 60,
        "refresh_token_expire_days": 30
    },
    "limits": {
        "free_daily_limit": 10
    }
}' > config.json
    echo "✅ 默认配置文件已创建"
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

# 检查前端目录是否已初始化
if [ ! -d "frontend/node_modules" ]; then
    echo "📁 创建 Expo 项目..."
    
    # 如果 frontend 目录存在但没有 package.json，删除它
    if [ -d "frontend" ] && [ ! -f "frontend/package.json" ]; then
        rm -rf frontend
    fi
    
    # 创建 Expo 项目
    if [ ! -d "frontend" ]; then
        npx -y create-expo-app@latest frontend --template blank-typescript
    fi
    
    cd frontend
    
    echo "📥 安装前端依赖..."
    npx expo install expo-av expo-router nativewind tailwindcss zustand @react-native-async-storage/async-storage react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
    
    # 安装 NativeWind 相关
    npm install --save-dev tailwindcss@3.3.2
    
    echo "✅ 前端依赖安装完成"
else
    echo "📁 前端项目已存在，跳过创建"
    cd frontend
    npm install -q
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
echo "  - CONFIG_GUIDE.md    配置热切换指南"
echo "  - CLOUD_DEPLOYMENT.md  云部署教程"
echo ""
echo "=================================="
