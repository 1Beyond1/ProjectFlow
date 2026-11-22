简体中文 | [English](README.en.md)

# Project Flow (心流清单)

> AI 驱动的跨端语音 / 文字 / 图片任务与专注提醒应用（iOS / Android / Web）

## 技术栈

- **前端**：Expo 54（React Native + React Native Web + TypeScript）+ Expo Router + NativeWind v4 + Zustand
- **后端**：Python FastAPI + SQLAlchemy（异步双模：本地默认 SQLite，生产支持 MySQL `mysql+aiomysql`）+ Redis（可选，封禁用户缓存同步）+ JWT 认证
- **AI 服务**：兼容 OpenAI 接口的 STT / LLM / Vision 服务（默认 SiliconFlow：`FunAudioLLM/SenseVoiceSmall`、`Qwen/Qwen3-8B` / `Qwen/Qwen2.5-7B-Instruct`、`THUDM/GLM-4.1V-9B-Thinking`，支持通过 `backend/config.json` 热切换）

## 项目结构

```text
ProjectFlow/
├── frontend/                 # Expo 跨端应用（iOS / Android / Web）
│   ├── app/                  # Expo Router 页面与导航
│   ├── components/           # 移动端与 Web 端组件
│   ├── hooks/                # 录音、统计、封禁检查等 Hooks
│   ├── services/             # 后端 API 客户端
│   └── store/                # Zustand 状态管理（任务、番茄钟、鉴权、配置、多语言）
├── backend/                  # FastAPI 后端服务
│   ├── main.py               # 应用入口、AI 处理与任务分析接口
│   ├── routers/              # 认证（/auth）、番茄钟（/pomodoro）、对话健康检查
│   ├── schemas/              # Pydantic 请求/响应模型
│   ├── database.py           # SQLAlchemy 异步数据库与 Redis 初始化
│   ├── auth.py               # JWT 鉴权、配额限流与模型配置读取
│   ├── config.example.json   # 服务端多模型配置模板
│   ├── Dockerfile            # 后端容器镜像定义
│   └── requirements.txt      # Python 依赖
├── docker-compose.yml        # Docker Compose 后端编排
├── setup.sh                  # 一键环境初始化脚本
├── CONFIG_GUIDE.md           # 后端 config.json 热切换指南
├── CLOUD_DEPLOYMENT.md       # 云端部署指南（1Panel / Docker Compose / Web 静态导出）
├── LICENSE                   # MIT 许可证
└── README.md                 # 本文件
```

## 快速启动

### 1. 环境初始化

```bash
# Linux / macOS / Windows (Git Bash)
bash setup.sh

# 或手动初始化：
# 后端（需要 Python 3.9+）
cd backend
python -m venv venv
.\venv\Scripts\activate    # Windows
# source venv/bin/activate # Linux / macOS
pip install -r requirements.txt

# 前端（需要 Node.js 18+）
cd frontend
npm install
```

### 2. 配置后端 `config.json`

复制 `backend/config.example.json` 为 `backend/config.json`，填入你的 API Key 和 `jwt.secret_key`（如运行了 `setup.sh` 会自动生成一份基础 `backend/config.json`）。配置按请求实时读取，支持热切换，详见 [CONFIG_GUIDE.md](CONFIG_GUIDE.md)。

可选环境变量：
- `DATABASE_URL`：数据库连接串（未设置时默认使用本地 `sqlite+aiosqlite:///.../flow.db`，生产可配置 `mysql+aiomysql://...`）
- `REDIS_URL`：Redis 连接地址（默认 `redis://localhost:6379/0`，未启动时会降级提示）

### 3. 启动后端

```bash
cd backend
.\venv\Scripts\activate    # Windows
# source venv/bin/activate # Linux / macOS

python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

后端服务将在 `http://localhost:8000` 启动，自动生成接口文档：`http://localhost:8000/docs`。

### 4. 启动前端

```bash
cd frontend
npx expo start          # 移动端（使用 Expo Go 扫码预览）
# npx expo start --web  # Web 端开发预览
```

## 开发者配置

除服务端 `backend/config.json` 外，也可以在前端「设置」页面配置以下参数（若服务端 `config.json` 已配置对应模型的 `api_key`，后端优先使用服务端配置）：

| 配置项 | 说明 | 默认示例 |
|--------|------|----------|
| API URL (`apiUrl`) | 后端服务地址 | `http://192.168.1.100:8000` |
| STT 配置 (`sttBaseUrl` / `sttApiKey` / `sttModel`) | 语音识别服务地址、密钥与模型 | `https://api.siliconflow.cn/v1` / `FunAudioLLM/SenseVoiceSmall` |
| LLM 配置 (`llmBaseUrl` / `llmApiKey` / `llmModel`) | 大语言模型服务地址、密钥与模型 | `https://api.siliconflow.cn/v1` / `Qwen/Qwen2.5-7B-Instruct`（后端默认 `Qwen/Qwen3-8B`，VIP 默认 `deepseek-ai/DeepSeek-R1-0528-Qwen3-8B`） |
| Vision 模型 (`visionModel`) | 图像解析模型 | `THUDM/GLM-4.1V-9B-Thinking` |

## API 接口

### 健康检查与模型目录

- `GET /`、`GET /api/health`：服务状态检查
- `GET /api/models`：返回当前用户等级可用的 LLM / Vision / STT 模型列表与限额配置
- `GET /api/chat/health`：聊天路由健康检查

### AI 任务提取与分析

#### `POST /api/process-audio`

上传音频文件（限制 10MB），经 STT 转写后由 LLM 提取任务列表。

**Headers（均可选，优先使用后端 `config.json`）：**
- `Authorization`: `Bearer <access_token>`（登录后按用户等级计费/限流）
- `X-STT-Base-Url` / `X-STT-Key` / `X-STT-Model`: 自定义 STT 服务商、密钥与模型
- `X-LLM-Base-Url` / `X-LLM-Key` / `X-LLM-Model`: 自定义 LLM 服务商、密钥与模型
- `X-Device-ID`: 设备标识
- `X-Client-Time`: 客户端当前时间（辅助解析相对时间）

**Body (`multipart/form-data`)：**
- `file`: 音频文件（默认按 `.aac` 处理）

**Response：**
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

#### 其他处理与辅助接口

- `POST /api/process-text`：纯文本提取任务（JSON：`{"text": "..."}`；可选 `X-LLM-*`、`X-Device-ID`、`X-Client-Time`、`Authorization`）
- `POST /api/process-image`：上传图片提取任务（需登录，支持可选 `X-Vision-Base-Url` / `X-Vision-Key` / `X-Vision-Model`）
- `POST /api/analyze-tasks`：按时间段对任务列表进行 AI 分类与统计分析（仅 VIP 用户）
- `GET /api/records`：获取历史解析记录（支持 `device_id`、`limit` 查询参数）
- `POST /api/test-connection`：验证 LLM API Key 连通性（Header：`X-LLM-Key` 必需，`X-LLM-Base-Url` 可选）

### 认证与番茄钟

- `POST /auth/register`、`POST /auth/login`、`GET /auth/me`、`POST /auth/refresh`：用户注册、登录、获取用户信息与刷新令牌
- `POST /pomodoro/end`、`GET /pomodoro/stats`：番茄钟打卡上报与统计查询

## 部署指南

### Docker Compose / 1Panel 云部署

仓库提供 [`docker-compose.yml`](docker-compose.yml) 与 [`backend/Dockerfile`](backend/Dockerfile)，支持结合 MySQL、Redis 及 Web 静态导出（`npx expo export -p web`）部署。完整步骤见 [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md)。

### 宝塔部署

1. **放行端口**：安全组 + 防火墙放行 8000 端口。
2. **创建 Python 项目**：
   - 项目路径：`/www/wwwroot/project-flow/backend`
   - Python 版本：3.9+
   - 安装依赖：`pip install -r requirements.txt`
   - 启动文件：`main.py`
   - 启动命令：`python -m uvicorn main:app --host 0.0.0.0 --port 8000`
3. **配置反向代理（可选）**：
   ```nginx
   location /api {
       proxy_pass http://127.0.0.1:8000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
   }
   ```

## 音频优化

为适应 3M 带宽限制，移动端录音默认采用以下配置：
- 格式：AAC
- 采样率：16000 Hz
- 比特率：32 kbps

约 10 秒语音体积在 40KB 左右，便于在较低带宽环境下快速上传。

## License

[MIT](LICENSE)

## ⚠️ 已知问题

### Web 端（桌面版）

Web 端功能已基本对齐移动端，但存在以下已知问题：

1. **统计页面图表渲染**：Stats 页面在 Web 端去掉了 NativeWind 动态样式（改用标准 StyleSheet），部分图表在窄屏下布局可能溢出。`react-native-chart-kit` 在 Web 端的渲染性能不如移动端，大数据量时可能有卡顿。
2. **番茄钟 Web 同步**：Web 端番茄钟的云端打卡逻辑已接入，但断网重连后的 Pending Queue 重试机制在 Web 端未经充分测试，极端情况下可能丢一次打卡记录。
3. **HTTP 环境兼容**：`expo-crypto` 的 `randomUUID()` 在 HTTP（非 HTTPS）环境下会抛异常，已做 `try/catch` + `Math.random` 兜底。但兜底的伪 UUID 在极端并发下有小概率碰撞，正式使用建议部署 HTTPS。
4. **CORS 白名单**：后端 `backend/main.py` 的 CORS 配置目前写死了开发环境的 IP 和端口。部署到生产环境时需要手动更新 `allow_origins` 列表。
5. **多端数据同步**：Web 端登录后，历史任务和番茄钟统计数据需要手动刷新才会从后端拉取，暂未实现自动同步。部分 GET 接口已预留但尚未全部接入前端。

### 移动端

1. **Android 日历滚动**：部分机型（已知红米 K80）在日历 FlatList 快速滑动时偶现白屏，原因是 `nestedScrollEnabled` 与 NativeWind 的 CSS 互操作层存在兼容问题。
2. **iOS 视频预览**：暂未实现，当前仅支持照片预览。

### 通用

1. **音频格式限制**：后端 STT 目前仅测试过 AAC 32kbps 输入，其他格式/码率未验证。
2. **SQLite 并发**：开发环境默认使用 SQLite，高并发写入时可能出现 `database is locked`。生产环境建议通过 `DATABASE_URL` 切换为 MySQL。
