简体中文 | [English](README.en.md)

<p align="center">
  <img src="docs/assets/logo.png" alt="ProjectFlow Logo" width="84" />
</p>

# Project Flow (心流清单)

> AI 驱动的跨端语音 / 文字 / 图片任务与专注提醒应用（iOS / Android / Web）

## 界面预览

### Web 端：今日聚焦、番茄专注与 AI 洞察工作台

![ProjectFlow Web 端今日聚焦与番茄专注工作台](docs/screenshots/web-dashboard.png)

| 移动端：今日聚焦与按住说话语音输入 | Web 端：多列表任务收件箱管理 |
| :---: | :---: |
| <img src="docs/screenshots/mobile-home.png" alt="ProjectFlow 移动端今日聚焦与语音输入" width="260" /> | <img src="docs/screenshots/web-tasks.png" alt="ProjectFlow Web 端任务收件箱管理" width="560" /> |

## 技术栈

- **前端**：Expo 54（React Native + React Native Web + TypeScript）+ Expo Router + NativeWind v4 + Zustand
- **后端**：Python FastAPI + SQLAlchemy（异步双模：本地默认 SQLite，生产支持 MySQL `mysql+aiomysql`）+ Redis（封禁缓存原子同步与番茄钟幂等去重）+ JWT 认证（Refresh Token SHA-256 哈希轮换与吊销）
- **AI 服务**：兼容 OpenAI 接口的 STT / LLM / Vision 服务（默认 SiliconFlow：`FunAudioLLM/SenseVoiceSmall`、`Qwen/Qwen3-8B` / `Qwen/Qwen2.5-7B-Instruct`、`THUDM/GLM-4.1V-9B-Thinking`，支持通过 `backend/config.json` 热切换）

## 项目结构

```text
ProjectFlow/
├── frontend/                 # Expo 跨端应用（iOS / Android / Web）
│   ├── app/                  # Expo Router 页面与导航
│   ├── components/           # 移动端与 Web 端组件
│   ├── hooks/                # 录音、统计、封禁检查等 Hooks
│   ├── services/             # 后端 API 客户端
│   ├── store/                # Zustand 状态管理（任务、番茄钟、鉴权、配置、多语言）
│   └── utils/                # 本地日期、图片压缩与 UUID 工具
├── backend/                  # FastAPI 后端服务
│   ├── main.py               # 应用入口、AI 处理、历史记录与任务分析接口
│   ├── auth.py               # 强 JWT 密钥校验、原生 bcrypt、封禁校验与模型配置加载
│   ├── security.py           # SSRF 出站校验、URL 密码脱敏、客户端时间校验与流式上传限流
│   ├── routers/              # 认证（/auth）、番茄钟（/api/pomodoro 与 /pomodoro 兼容）、对话健康检查
│   ├── schemas/              # Pydantic 请求/响应模型
│   ├── database.py           # SQLAlchemy 异步数据库、原子配额预扣/回滚与 Redis 初始化
│   ├── tests/                # Pytest 安全与回归测试套件
│   ├── config.example.json   # 服务端 v2 多模型配置模板
│   ├── Dockerfile            # Python 3.12 非 root 后端容器镜像定义
│   └── requirements.txt      # Python 依赖
├── .github/workflows/ci.yml  # GitHub Actions CI（后端 pytest + 前端 tsc）
├── docker-compose.yml        # Docker Compose 后端编排（仅绑定 127.0.0.1:8000）
├── setup.sh                  # 一键环境初始化脚本（生成 v2 config.json 与强随机 JWT 密钥）
├── CONFIG_GUIDE.md           # 后端 v2 config.json 热切换与安全指南
├── CLOUD_DEPLOYMENT.md       # 云端部署指南（1Panel / Docker Compose / OpenResty 反代）
├── LICENSE                   # MIT 许可证
└── README.md                 # 本文件
```

## 快速启动

### 1. 环境初始化

```bash
# Linux / macOS / Windows (Git Bash)
bash setup.sh

# 或手动初始化：
# 后端（需要 Python 3.10+，推荐 3.12）
cd backend
python -m venv venv
.\venv\Scripts\activate    # Windows
# source venv/bin/activate # Linux / macOS
pip install -r requirements.txt

# 前端（需要 Node.js 18+，推荐 20）
cd frontend
npm install
```

### 2. 配置后端 `config.json` 与环境变量

复制 `backend/config.example.json` 为 `backend/config.json`，填入上游模型 `api_key` 与高强度随机 `jwt.secret_key`（至少 32 位，拒绝占位符与弱密钥；运行 `setup.sh` 会自动生成符合 v2 结构的配置与 64 位随机密钥）。详见 [CONFIG_GUIDE.md](CONFIG_GUIDE.md)。

环境变量说明：
- `JWT_SECRET_KEY`：JWT 签名密钥（**优先于 `config.json`**，至少 32 字符，生产环境强烈推荐通过环境变量注入）
- `DATABASE_URL`：数据库连接串（未设置时默认使用本地 `sqlite+aiosqlite:///.../flow.db`，生产建议 `mysql+aiomysql://flow_user:...@host:3306/project_flow`）
- `REDIS_URL`：Redis 连接地址（默认 `redis://localhost:6379/0`，日志自动脱敏密码；封禁校验在 Redis 不可用时自动 Fail-Closed 回落数据库）
- `CORS_ALLOW_ORIGINS`：允许跨域的前端源列表，逗号分隔（默认仅允许本机 Expo 开发源）

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
# 可选：通过环境变量指定默认后端地址（默认 http://localhost:8000）
# EXPO_PUBLIC_API_URL=http://192.168.1.100:8000 npx expo start
npx expo start          # 移动端（使用 Expo Go 扫码预览）
# npx expo start --web  # Web 端开发预览
```

## 开发者配置

- 默认后端地址优先读取 `EXPO_PUBLIC_API_URL`，未配置时回退为 `http://localhost:8000`。
- 用户可在 App「设置 -> 开发者选项」中直接修改并保存 `API URL`。
- 若服务端 `config.json` 已配置对应模型的 `api_key`，后端优先使用服务端配置，且**绝不将服务端密钥发送到客户端传入的任意 `Base-Url`**。

| 配置项 | 说明 | 默认示例 |
|--------|------|----------|
| API URL (`apiUrl`) | 后端服务地址（支持在设置页编辑保存） | `http://localhost:8000` |
| STT 配置 (`sttBaseUrl` / `sttApiKey` / `sttModel`) | 语音识别服务地址、密钥与模型 | `https://api.siliconflow.cn/v1` / `FunAudioLLM/SenseVoiceSmall` |
| LLM 配置 (`llmBaseUrl` / `llmApiKey` / `llmModel`) | 大语言模型服务地址、密钥与模型 | `https://api.siliconflow.cn/v1` / `Qwen/Qwen2.5-7B-Instruct`（后端默认 `Qwen/Qwen3-8B`，VIP 默认 `deepseek-ai/DeepSeek-R1-0528-Qwen3-8B`） |
| Vision 模型 (`visionModel`) | 图像解析模型 | `THUDM/GLM-4.1V-9B-Thinking` |

## API 接口

### 健康检查与模型目录

- `GET /`、`GET /api/health`：服务状态检查（不暴露服务器内部路径）
- `GET /api/models`：返回当前用户等级可用的 LLM / Vision / STT 模型列表与剩余配额
- `GET /api/chat/health`：聊天路由健康检查

### AI 任务提取与分析

- `POST /api/process-audio`：分块流式上传音频（上限 10MB），经 STT 转写后由 LLM 提取任务列表（`X-Client-Time` 严格校验 `YYYY-MM-DD HH:MM:SS` 格式）
- `POST /api/process-text`：纯文本提取任务（JSON：`{"text": "..."}`，长度校验 1~10000 字符；触发限流准确返回 HTTP 429）
- `POST /api/process-image`：上传图片提取任务（需登录、10MB 上限 + 图片魔数校验 + 原子配额扣减与失败回滚；未提供自有 `X-Vision-Key` 时严格忽略 `X-Vision-Base-Url`）
- `POST /api/analyze-tasks`：按时间段对任务列表进行 AI 分类与统计分析（仅 VIP 用户，结构化校验）
- `GET /api/records`：**需登录鉴权**，严格隔离仅返回当前登录用户自己的历史记录（`limit` 范围 `1~100`）
- `POST /api/test-connection`：**需登录鉴权**，验证 LLM API Key 连通性（严格 HTTPS 公网出站 SSRF 校验、禁用重定向、脱敏上游错误）

### 认证与番茄钟

- `POST /auth/register`、`POST /auth/login`、`GET /auth/me`、`POST /auth/refresh`、`POST /auth/logout`：用户注册、登录（防枚举）、用户信息查询、Refresh Token 哈希轮换/重放吊销与主动登出
- `POST /api/pomodoro/end`、`GET /api/pomodoro/stats`：番茄钟打卡上报与统计查询（同时保留 `/pomodoro/*` 向后兼容路径）

## 测试与质量检查

```bash
# 后端 Pytest 安全与回归测试
cd backend
pip install -r requirements.txt pytest
pytest -v

# 前端 TypeScript 类型检查
cd frontend
npm ci
npx tsc --noEmit
```

## 部署指南

### Docker Compose / 1Panel 云部署

仓库提供安全加固后的 [`docker-compose.yml`](docker-compose.yml) 与 [`backend/Dockerfile`](backend/Dockerfile)（Python 3.12 非 root 运行、端口仅绑定 `127.0.0.1:8000`、只读挂载配置）。完整步骤及反向代理配置（**需同时代理 `/api/` 与 `/auth/`**）见 [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md)。

### 宝塔 / Nginx 反向代理示例

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    client_max_body_size 12m;
}

location /auth/ {
    proxy_pass http://127.0.0.1:8000/auth/;
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

1. **统计页面图表渲染**：`react-native-chart-kit` 在 Web 端大数据量时渲染性能一般，窄屏下布局可能溢出。
2. **HTTP 环境兼容**：`expo-crypto` 的 `randomUUID()` 在非 HTTPS 环境下会降级为伪随机 UUID，正式部署建议使用 HTTPS。
3. **多端数据同步**：Web 端登录后，历史任务和番茄钟统计数据需手动刷新拉取，暂未实现自动后台双向同步。

### 移动端

1. **Android 日历滚动**：部分机型在日历 FlatList 快速滑动时偶现白屏，与 NativeWind CSS 互操作层存在已知兼容问题。
2. **iOS 视频预览**：暂未实现，当前仅支持照片预览。

### 通用

1. **音频格式限制**：后端 STT 目前主要验证了 AAC 32kbps 输入。
2. **SQLite 并发**：开发环境默认使用 SQLite，高并发写入场景生产环境请通过 `DATABASE_URL` 切换为 MySQL。
