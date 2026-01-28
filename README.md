# Project Flow (心流清单)

> AI 驱动的双端通用语音提醒 App

## 技术栈

- **前端**: Expo (React Native + TypeScript) + NativeWind
- **后端**: Python FastAPI + SQLite
- **AI 服务**: SiliconFlow (STT + LLM)

## 项目结构

```
/project-flow
├── /frontend       # Expo 移动端应用
├── /backend        # FastAPI 后端服务
├── setup.sh        # 一键环境初始化脚本
└── README.md       # 本文件
```

## 快速启动

### 1. 环境初始化

```bash
# Linux/macOS
bash setup.sh

# Windows (Git Bash)
bash setup.sh

# 或手动初始化：
# 后端
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
pip install -r requirements.txt

# 前端
cd frontend
npm install
```

### 2. 启动后端

```bash
cd backend
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/macOS

python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

后端服务将在 `http://localhost:8000` 启动。

API 文档: `http://localhost:8000/docs`

### 3. 启动前端

```bash
cd frontend
npx expo start
```

使用 Expo Go App 扫描二维码即可在手机上预览。

## 开发者配置

首次使用时，请在 App 的「设置」页面配置以下信息：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| API URL | 后端服务地址 | `http://192.168.1.100:8000` |
| SiliconFlow Key | API 密钥 | `sk-xxx...` |
| STT Model | 语音识别模型 | `SenseVoiceSmall` |
| LLM Model | 大语言模型 | `deepseek-ai/DeepSeek-V3` |

## API 接口

### POST /api/process-audio

处理音频文件，返回 AI 解析的任务列表。

**Headers:**
- `X-SiliconFlow-Key`: API Key (必需)
- `X-STT-Model`: STT 模型 (可选)
- `X-LLM-Model`: LLM 模型 (可选)
- `X-Device-ID`: 设备 ID (可选)

**Body:**
- `file`: 音频文件 (AAC 格式)

**Response:**
```json
{
  "success": true,
  "raw_text": "明天下午三点开会",
  "ai_result": {
    "tasks": [
      {
        "title": "开会",
        "time": "明天下午三点",
        "suggestion": "建议提前准备会议材料",
        "priority": "high"
      }
    ],
    "summary": "一个会议提醒"
  },
  "record_id": 1
}
```

### GET /api/records

获取历史记录列表。

### POST /api/test-connection

测试 API Key 是否有效。

## 宝塔部署

1. **放行端口**: 安全组 + 防火墙放行 8000 端口

2. **创建 Python 项目**:
   - 项目路径: `/www/wwwroot/project-flow/backend`
   - Python 版本: 3.9+
   - 安装依赖: `pip install -r requirements.txt`
   - 启动文件: `main.py`
   - 启动命令: `python -m uvicorn main:app --host 0.0.0.0 --port 8000`

3. **配置反向代理** (可选):
   在 Nginx 配置中添加:
   ```nginx
   location /api {
       proxy_pass http://127.0.0.1:8000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
   }
   ```

## 音频优化

为适应 3M 带宽限制，音频采用以下配置：
- 格式: AAC
- 采样率: 16000 Hz
- 比特率: 32 kbps

这确保了 10 秒语音约 40KB，可在 3M 带宽下秒传。

## License

MIT

## ⚠️ 已知问题

### Web 端（桌面版）

Web 端功能已基本对齐移动端，但存在以下已知问题：

1. **统计页面图表渲染**：Stats 页面在 Web 端去掉了 NativeWind 动态样式（改用标准 StyleSheet），部分图表在窄屏下布局可能溢出。`react-native-chart-kit` 在 Web 端的渲染性能不如移动端，大数据量时可能有卡顿。

2. **番茄钟 Web 同步**：Web 端番茄钟的云端打卡逻辑已接入，但断网重连后的 Pending Queue 重试机制在 Web 端未经充分测试，极端情况下可能丢一次打卡记录。

3. **HTTP 环境兼容**：`expo-crypto` 的 `randomUUID()` 在 HTTP（非 HTTPS）环境下会抛异常，已做 `try/catch` + `Math.random` 兜底。但兜底的伪 UUID 在极端并发下有小概率碰撞，正式使用建议部署 HTTPS。

4. **CORS 白名单**：后端 `main.py` 的 CORS 配置目前写死了开发环境的 IP 和端口。部署到生产环境时需要手动更新 `allow_origins` 列表。

5. **多端数据同步**：Web 端登录后，历史任务和番茄钟统计数据需要手动刷新才会从后端拉取，暂未实现自动同步。Get 接口已预留但部分未接入前端。

### 移动端

1. **Android 日历滚动**：部分机型（已知红米 K80）在日历 FlatList 快速滑动时偶现白屏，原因是 `nestedScrollEnabled` 与 NativeWind 的 CSS 互操作层存在兼容问题。
2. **iOS 视频预览**：暂未实现，当前仅支持照片预览。

### 通用

1. **音频格式限制**：后端 STT 目前仅测试过 AAC 32kbps 输入，其他格式/码率未验证。
2. **SQLite 并发**：开发环境使用 SQLite，高并发写入时可能出现 `database is locked`。生产环境建议使用 MySQL。
