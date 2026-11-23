[简体中文](README.md) | English

# Project Flow

> AI-Powered Cross-Platform Voice, Text & Image Task and Focus Reminder App (iOS / Android / Web)

## Tech Stack

- **Frontend**: Expo 54 (React Native + React Native Web + TypeScript) + Expo Router + NativeWind v4 + Zustand
- **Backend**: Python FastAPI + SQLAlchemy (async dual-mode: SQLite by default for local dev, MySQL via `mysql+aiomysql` for production) + Redis (atomic ban-list cache sync & Pomodoro idempotency) + JWT auth (Refresh Token SHA-256 hash rotation & revocation)
- **AI Services**: OpenAI-compatible STT / LLM / Vision providers (defaults to SiliconFlow: `FunAudioLLM/SenseVoiceSmall`, `Qwen/Qwen3-8B` / `Qwen/Qwen2.5-7B-Instruct`, `THUDM/GLM-4.1V-9B-Thinking`, with hot-reloading via `backend/config.json`)

## Project Structure

```text
ProjectFlow/
├── frontend/                 # Expo cross-platform app (iOS / Android / Web)
│   ├── app/                  # Expo Router screens & navigation
│   ├── components/           # Mobile and Web UI components
│   ├── hooks/                # Audio recording, stats, and ban-check hooks
│   ├── services/             # Backend API client
│   ├── store/                # Zustand stores (tasks, Pomodoro, auth, config, i18n)
│   └── utils/                # Local date formatting, image compression & UUID utilities
├── backend/                  # FastAPI backend service
│   ├── main.py               # App entrypoint, AI extraction, records & analysis endpoints
│   ├── auth.py               # Strong JWT validation, native bcrypt, ban checks & config loader
│   ├── security.py           # Outbound SSRF validator, URL masking, time & upload guards
│   ├── routers/              # Auth (/auth), Pomodoro (/api/pomodoro + /pomodoro compat), chat health
│   ├── schemas/              # Pydantic request/response schemas
│   ├── database.py           # Async SQLAlchemy, atomic quota reserve/refund & Redis init
│   ├── tests/                # Pytest security & regression test suite
│   ├── config.example.json   # Server-side v2 multi-model config template
│   ├── Dockerfile            # Python 3.12 non-root backend container definition
│   └── requirements.txt      # Python dependencies
├── .github/workflows/ci.yml  # GitHub Actions CI (backend pytest + frontend tsc)
├── docker-compose.yml        # Hardened Docker Compose setup (127.0.0.1:8000 binding)
├── setup.sh                  # One-command setup script (v2 config.json + strong JWT secret)
├── CONFIG_GUIDE.md           # Hot-reloading v2 config.json guide (in Chinese)
├── CLOUD_DEPLOYMENT.md       # Cloud deployment guide (1Panel / Docker Compose / Reverse Proxy)
├── LICENSE                   # MIT License
└── README.md                 # Chinese README
```

## Quick Start

### 1. Environment Setup

```bash
# Linux / macOS / Windows (Git Bash)
bash setup.sh

# Or set up manually:
# Backend (Python 3.10+, 3.12 recommended)
cd backend
python -m venv venv
.\venv\Scripts\activate    # Windows
# source venv/bin/activate # Linux / macOS
pip install -r requirements.txt

# Frontend (Node.js 18+, 20 recommended)
cd frontend
npm install
```

### 2. Configure Backend `config.json` & Environment Variables

Copy `backend/config.example.json` to `backend/config.json` and set your provider `api_key` and a strong random `jwt.secret_key` (at least 32 characters; placeholders and weak keys are rejected). Running `setup.sh` generates a v2 `backend/config.json` with a 64-hex random secret automatically. See [CONFIG_GUIDE.md](CONFIG_GUIDE.md).

Environment variables:
- `JWT_SECRET_KEY`: JWT signing secret (**takes precedence over `config.json`**, minimum 32 chars; recommended for production)
- `DATABASE_URL`: Async SQLAlchemy URL (defaults to local `sqlite+aiosqlite:///.../flow.db`; use `mysql+aiomysql://flow_user:...@host:3306/project_flow` in production)
- `REDIS_URL`: Redis connection URL (defaults to `redis://localhost:6379/0`, passwords masked in logs; ban checks fail closed via DB fallback if Redis is unavailable)
- `CORS_ALLOW_ORIGINS`: Comma-separated list of allowed frontend origins (defaults to localhost Expo origins)

### 3. Start the Backend

```bash
cd backend
.\venv\Scripts\activate    # Windows
# source venv/bin/activate # Linux / macOS

python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend runs at `http://localhost:8000`, with OpenAPI docs at `http://localhost:8000/docs`.

### 4. Start the Frontend

```bash
cd frontend
# Optional: set default backend URL via env var (defaults to http://localhost:8000)
# EXPO_PUBLIC_API_URL=http://192.168.1.100:8000 npx expo start
npx expo start          # Mobile (scan QR code in Expo Go)
# npx expo start --web  # Web development preview
```

## Developer Configuration

- The default backend URL reads `EXPO_PUBLIC_API_URL` and falls back to `http://localhost:8000`.
- You can edit and save `API URL` directly in **Settings -> Developer Options**.
- When server-side `config.json` configures a provider `api_key`, the backend never sends server credentials to client-supplied `Base-Url` headers.

| Setting | Description | Default / Example |
|---------|-------------|-------------------|
| API URL (`apiUrl`) | Backend server URL (editable in Settings) | `http://localhost:8000` |
| STT (`sttBaseUrl` / `sttApiKey` / `sttModel`) | Speech-to-text provider URL, key, and model | `https://api.siliconflow.cn/v1` / `FunAudioLLM/SenseVoiceSmall` |
| LLM (`llmBaseUrl` / `llmApiKey` / `llmModel`) | Language model provider URL, key, and model | `https://api.siliconflow.cn/v1` / `Qwen/Qwen2.5-7B-Instruct` (backend default `Qwen/Qwen3-8B`, VIP default `deepseek-ai/DeepSeek-R1-0528-Qwen3-8B`) |
| Vision (`visionModel`) | Vision model for image extraction | `THUDM/GLM-4.1V-9B-Thinking` |

## API Endpoints

### Health & Model Catalog

- `GET /`, `GET /api/health`: Service health check (does not expose server filesystem paths)
- `GET /api/models`: Returns available LLM / Vision / STT models and remaining tier quotas
- `GET /api/chat/health`: Chat router health check

### AI Task Extraction & Analysis

- `POST /api/process-audio`: Stream-limited audio upload (10 MB max), STT transcription, and LLM task extraction (`X-Client-Time` strictly validated as `YYYY-MM-DD HH:MM:SS`)
- `POST /api/process-text`: Extract tasks from plain text (JSON `{"text": "..."}`, 1-10000 chars; propagates HTTP 429 on quota limit)
- `POST /api/process-image`: Extract tasks from an uploaded image (login required, 10 MB max + image magic-byte validation, atomic quota reserve & failure refund; ignores `X-Vision-Base-Url` unless client supplies its own `X-Vision-Key`)
- `POST /api/analyze-tasks`: AI categorization and summary across tasks in a date range (VIP only, validated schema)
- `GET /api/records`: **Authentication required**; strictly scoped to the authenticated user's own records (`limit` bounded `1..100`)
- `POST /api/test-connection`: **Authentication required**; validates an LLM API key with strict public-HTTPS SSRF protection, `follow_redirects=False`, and sanitized error messages

### Authentication & Pomodoro

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/refresh`, `POST /auth/logout`: Registration, anti-enumeration login, profile lookup, Refresh Token SHA-256 rotation/replay revocation, and logout
- `POST /api/pomodoro/end`, `GET /api/pomodoro/stats`: Record Pomodoro sessions and query focus stats (`/pomodoro/*` kept for backwards compatibility)

## Testing & Type Checking

```bash
# Backend pytest suite
cd backend
pip install -r requirements.txt pytest
pytest -v

# Frontend TypeScript check
cd frontend
npm ci
npx tsc --noEmit
```

## Deployment

### Docker Compose / 1Panel

The repository ships hardened [`docker-compose.yml`](docker-compose.yml) and [`backend/Dockerfile`](backend/Dockerfile) definitions (Python 3.12 non-root runtime, `127.0.0.1:8000` loopback binding, read-only config mount). See [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md) for full deployment steps and reverse proxy rules (**proxy both `/api/` and `/auth/`**).

### Nginx Reverse Proxy Example

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

1. **Stats chart rendering**: `react-native-chart-kit` renders more slowly on Web with large datasets and may overflow on narrow viewports.
2. **HTTP (non-HTTPS) environments**: `expo-crypto`'s `randomUUID()` falls back to pseudo-random UUIDs outside secure contexts; HTTPS is recommended for production.
3. **Cross-device sync**: Historical tasks and Pomodoro stats currently require a manual refresh after login rather than automatic background two-way sync.

### Mobile

1. **Android calendar scrolling**: Rapid scrolling on the calendar `FlatList` can occasionally blank out on some devices due to NativeWind's CSS interop layer.
2. **iOS video preview**: Not yet implemented; only photo previews are supported.

### General

1. **Audio format coverage**: Backend STT has primarily been verified with 32 kbps AAC audio.
2. **SQLite concurrency**: Local development defaults to SQLite; switch to MySQL via `DATABASE_URL` for high-concurrency production workloads.
