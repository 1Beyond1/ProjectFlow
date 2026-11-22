[简体中文](README.md) | English

# Project Flow

> AI-Powered Cross-Platform Voice, Text & Image Task and Focus Reminder App (iOS / Android / Web)

## Tech Stack

- **Frontend**: Expo 54 (React Native + React Native Web + TypeScript) + Expo Router + NativeWind v4 + Zustand
- **Backend**: Python FastAPI + SQLAlchemy (async dual-mode: SQLite by default for local dev, MySQL via `mysql+aiomysql` for production) + Redis (optional, banned-user cache sync) + JWT auth
- **AI Services**: OpenAI-compatible STT / LLM / Vision providers (defaults to SiliconFlow: `FunAudioLLM/SenseVoiceSmall`, `Qwen/Qwen3-8B` / `Qwen/Qwen2.5-7B-Instruct`, `THUDM/GLM-4.1V-9B-Thinking`, with hot-reloading via `backend/config.json`)

## Project Structure

```text
ProjectFlow/
├── frontend/                 # Expo cross-platform app (iOS / Android / Web)
│   ├── app/                  # Expo Router screens & navigation
│   ├── components/           # Mobile and Web UI components
│   ├── hooks/                # Audio recording, stats, and ban-check hooks
│   ├── services/             # Backend API client
│   └── store/                # Zustand stores (tasks, Pomodoro, auth, config, i18n)
├── backend/                  # FastAPI backend service
│   ├── main.py               # App entrypoint, AI extraction & task analysis endpoints
│   ├── routers/              # Auth (/auth), Pomodoro (/pomodoro), chat health
│   ├── schemas/              # Pydantic request/response schemas
│   ├── database.py           # Async SQLAlchemy & Redis initialization
│   ├── auth.py               # JWT auth, rate limits & model config loader
│   ├── config.example.json   # Server-side multi-model config template
│   ├── Dockerfile            # Backend container image definition
│   └── requirements.txt      # Python dependencies
├── docker-compose.yml        # Docker Compose backend orchestration
├── setup.sh                  # One-command environment setup script
├── CONFIG_GUIDE.md           # Hot-reloading config.json guide (in Chinese)
├── CLOUD_DEPLOYMENT.md       # Cloud deployment guide (1Panel / Docker Compose / Web export, in Chinese)
├── LICENSE                   # MIT License
└── README.md                 # Chinese README
```

## Quick Start

### 1. Environment Setup

```bash
# Linux / macOS / Windows (Git Bash)
bash setup.sh

# Or set up manually:
# Backend (Python 3.9+)
cd backend
python -m venv venv
.\venv\Scripts\activate    # Windows
# source venv/bin/activate # Linux / macOS
pip install -r requirements.txt

# Frontend (Node.js 18+)
cd frontend
npm install
```

### 2. Configure Backend `config.json`

Copy `backend/config.example.json` to `backend/config.json` and fill in your API key(s) and `jwt.secret_key` (`setup.sh` generates a starter `backend/config.json` if one does not exist). Configuration is reloaded per request without restarting the server — see [CONFIG_GUIDE.md](CONFIG_GUIDE.md) (in Chinese).

Optional environment variables:
- `DATABASE_URL`: SQLAlchemy async database URL (defaults to local `sqlite+aiosqlite:///.../flow.db`; set `mysql+aiomysql://...` for MySQL in production)
- `REDIS_URL`: Redis connection URL (defaults to `redis://localhost:6379/0`; logs a warning and degrades if Redis is unavailable)

### 3. Start the Backend

```bash
cd backend
.\venv\Scripts\activate    # Windows
# source venv/bin/activate # Linux / macOS

python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend runs at `http://localhost:8000`, with interactive OpenAPI docs at `http://localhost:8000/docs`.

### 4. Start the Frontend

```bash
cd frontend
npx expo start          # Mobile (scan QR code in Expo Go)
# npx expo start --web  # Web development preview
```

## Developer Configuration

In addition to server-side `backend/config.json`, you can configure the following fields in the app's **Settings** screen (when the server's `config.json` already defines an `api_key`, server config takes precedence):

| Setting | Description | Default / Example |
|---------|-------------|-------------------|
| API URL (`apiUrl`) | Backend server URL | `http://192.168.1.100:8000` |
| STT (`sttBaseUrl` / `sttApiKey` / `sttModel`) | Speech-to-text provider URL, key, and model | `https://api.siliconflow.cn/v1` / `FunAudioLLM/SenseVoiceSmall` |
| LLM (`llmBaseUrl` / `llmApiKey` / `llmModel`) | Language model provider URL, key, and model | `https://api.siliconflow.cn/v1` / `Qwen/Qwen2.5-7B-Instruct` (backend default `Qwen/Qwen3-8B`, VIP default `deepseek-ai/DeepSeek-R1-0528-Qwen3-8B`) |
| Vision (`visionModel`) | Vision model for image extraction | `THUDM/GLM-4.1V-9B-Thinking` |

## API Endpoints

### Health & Model Catalog

- `GET /`, `GET /api/health`: Service health check
- `GET /api/models`: Returns available LLM / Vision / STT models and tier limits
- `GET /api/chat/health`: Chat router health check

### AI Task Extraction & Analysis

#### `POST /api/process-audio`

Uploads an audio clip (10 MB limit), transcribes it via STT, and extracts structured tasks with an LLM.

**Headers (all optional; server `config.json` takes precedence when configured):**
- `Authorization`: `Bearer <access_token>` (applies authenticated user tier & rate limits)
- `X-STT-Base-Url` / `X-STT-Key` / `X-STT-Model`: Custom STT endpoint, key, and model
- `X-LLM-Base-Url` / `X-LLM-Key` / `X-LLM-Model`: Custom LLM endpoint, key, and model
- `X-Device-ID`: Client device identifier
- `X-Client-Time`: Client local timestamp (helps resolve relative due times)

**Body (`multipart/form-data`):**
- `file`: Audio file (defaults to `.aac` extension)

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

#### Other Processing & Utility Endpoints

- `POST /api/process-text`: Extract tasks from plain text (JSON: `{"text": "..."}`; optional `X-LLM-*`, `X-Device-ID`, `X-Client-Time`, `Authorization`)
- `POST /api/process-image`: Extract tasks from an uploaded image (login required; optional `X-Vision-Base-Url` / `X-Vision-Key` / `X-Vision-Model`)
- `POST /api/analyze-tasks`: AI categorization and summary across tasks in a date range (VIP only)
- `GET /api/records`: List historical parsing records (optional query params `device_id`, `limit`)
- `POST /api/test-connection`: Validate an LLM API key against `{X-LLM-Base-Url}/models` (headers: required `X-LLM-Key`, optional `X-LLM-Base-Url`)

### Authentication & Pomodoro

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/refresh`: Registration, login, profile lookup, and token refresh
- `POST /pomodoro/end`, `GET /pomodoro/stats`: Record Pomodoro sessions and query focus statistics

## Deployment

### Docker Compose / 1Panel

The repository includes [`docker-compose.yml`](docker-compose.yml) and [`backend/Dockerfile`](backend/Dockerfile) for containerized deployment with MySQL and Redis, alongside static web export (`npx expo export -p web`). See [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md) (in Chinese) for full steps.

### Baota Panel

1. **Open port**: Allow port `8000` in your cloud security group and firewall.
2. **Create Python project**:
   - Project path: `/www/wwwroot/project-flow/backend`
   - Python version: 3.9+
   - Install dependencies: `pip install -r requirements.txt`
   - Startup file: `main.py`
   - Start command: `python -m uvicorn main:app --host 0.0.0.0 --port 8000`
3. **Optional Nginx reverse proxy**:
   ```nginx
   location /api {
       proxy_pass http://127.0.0.1:8000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
   }
   ```

## Audio Optimization

To work well on constrained 3 Mbps links, mobile recording defaults to:
- Format: AAC
- Sample rate: 16000 Hz
- Bitrate: 32 kbps

A 10-second clip is roughly 40 KB, allowing fast uploads even on slow connections.

## License

[MIT](LICENSE)

## Known Issues

### Web (Desktop)

1. **Stats chart rendering**: Dynamic NativeWind styles were replaced with standard `StyleSheet` on Web, so some charts may overflow on narrow viewports. `react-native-chart-kit` also renders more slowly on Web with large datasets.
2. **Pomodoro Web sync**: Cloud sync for Pomodoro sessions is wired up, but offline-reconnect retry behavior for the pending queue has not been thoroughly tested on Web and may drop a record in edge cases.
3. **HTTP (non-HTTPS) environments**: `expo-crypto`'s `randomUUID()` throws outside secure contexts; a `try/catch` + `Math.random` fallback is in place, though HTTPS is recommended for production to avoid collision risk.
4. **Hard-coded CORS allowlist**: `backend/main.py` currently hard-codes development origins in `allow_origins`. Update `allow_origins` before deploying to production.
5. **Cross-device sync**: After logging in on Web, historical tasks and Pomodoro stats require a manual refresh rather than automatic background sync; some backend GET endpoints are not yet fully wired into the frontend.

### Mobile

1. **Android calendar scrolling**: Rapid scrolling on the calendar `FlatList` can occasionally blank out on some devices (observed on Redmi K80) due to `nestedScrollEnabled` interacting with NativeWind's CSS interop layer.
2. **iOS video preview**: Not yet implemented; only photo previews are supported.

### General

1. **Audio format coverage**: Backend STT has only been tested with 32 kbps AAC audio; other formats/bitrates are unverified.
2. **SQLite concurrency**: Local development defaults to SQLite, which can raise `database is locked` under concurrent writes. Use MySQL via `DATABASE_URL` in production.
