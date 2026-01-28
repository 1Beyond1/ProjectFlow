# AGENTS.md

# Project Flow Agent Guide

This repository contains a FastAPI backend and an Expo (React Native) frontend.
Use this guide to keep agentic changes consistent and safe.

## Repository map

- `backend/`: FastAPI app, SQLite/SQLAlchemy, Redis usage
- `frontend/`: Expo app with TypeScript + NativeWind
- `setup.sh`: bootstrap script for both sides
- `README.md`: startup notes and API overview

## Build, lint, test

### Backend (FastAPI)

- Install deps:
  - `cd backend`
  - `python -m venv venv`
  - `venv\Scripts\activate` (Windows) or `source venv/bin/activate`
  - `pip install -r requirements.txt`
- Run dev server:
  - `python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`
- Tests:
  - No test runner configured in repo.
  - If you add tests, prefer `pytest` and document how to run them.
  - Single test example (if pytest is introduced):
    - `pytest path/to/test_file.py::test_name`
- Lint/format:
  - No lint/format tools configured in repo.
  - If adding, prefer `ruff` (lint + format) or `black` + `isort`.

### Frontend (Expo)

- Install deps:
  - `cd frontend`
  - `npm install`
- Start dev server:
  - `npm run start` or `npx expo start`
- Platform targets:
  - `npm run android`
  - `npm run ios`
  - `npm run web`
- Tests:
  - No test runner configured in repo.
  - If you add tests, prefer `jest` + `@testing-library/react-native`.
  - Single test example (if jest is introduced):
    - `npm test -- path/to/test-file.test.tsx -t "test name"`
- Lint/format:
  - No eslint/prettier scripts present.
  - If you add linting, document scripts in `frontend/package.json`.

## Code style guidelines

### General

- Keep changes scoped; avoid touching unrelated files.
- Use ASCII by default; Chinese strings are fine in user-facing prompts.
- Prefer explicit variable names; avoid single-letter names outside tight loops.
- Avoid unnecessary comments; add only when behavior is non-obvious.

### Python (backend)

- Use `async def` for request handlers and I/O; keep functions awaitable.
- Imports:
  - Standard library first, then third-party, then local modules.
  - Follow existing ordering in `backend/main.py`.
  - Prefer absolute imports (`from database import ...`).
- Types:
  - Use `typing.Optional` and Pydantic models for request/response data.
  - Keep model schemas in `schemas.py` and data models in `models.py`.
- Naming:
  - `snake_case` for functions and variables.
  - `PascalCase` for classes and Pydantic models.
  - Constants in `UPPER_SNAKE_CASE`.
- Error handling:
  - Use `HTTPException` for API errors with proper status codes.
  - Return consistent `JSONResponse` for known error cases.
  - Log context for external calls, but avoid logging secrets.
- API conventions:
  - Keep endpoints under `/api/*`.
  - Use `Header(..., alias="X-...")` for client config overrides.
- File handling:
  - Use `Path` from `pathlib` for filesystem paths.
  - Clean up temp files via `BackgroundTasks` or `finally` blocks.

### TypeScript/React Native (frontend)

- TypeScript strict mode is enabled; avoid `any`.
- Imports:
  - Third-party imports first, then local modules.
  - Prefer absolute-ish local paths within `frontend/` (current pattern).
- Components:
  - Use function components with hooks.
  - Keep UI in `components/` and state in `store/` (Zustand).
- Naming:
  - `PascalCase` for components and types.
  - `camelCase` for functions/variables.
  - Store hooks follow `useXStore` pattern.
- Styling:
  - Use NativeWind classes and Tailwind theme tokens.
  - Colors are defined in `tailwind.config.js`; avoid hardcoded colors.
- State:
  - Use Zustand stores for cross-screen state.
  - Keep transient UI state local to components.
- Error handling:
  - Surface network failures with user-friendly messages.
  - Keep API calls in `frontend/services/api.ts`.

## File conventions and structure

- Backend entrypoint: `backend/main.py`.
- Backend auth logic: `backend/auth.py` and `backend/routers/auth.py`.
- Backend config: `backend/config.json` (loaded by `auth.py`).
- Frontend router entry: `frontend/app/_layout.tsx`.
- Frontend utilities: `frontend/utils/`.

## Agent-specific rules (from `.agent/rules/walkthrough.md`)

- Do not assume hidden requirements; ask if unsure.
- After any substantial code change, append a record to `stepnote.md`.
  - Record must include: When / Where / Why / What.
  - Timestamp to minute precision.
- Read `stepnote.md` before starting tasks that change code.

## Safety and secrets

- Never commit or log API keys (`X-SiliconFlow-Key`, etc.).
- Avoid printing full tokens; mask if needed.
- Do not store secrets in repo files.

## Suggested development flow

- Backend: update schema/models -> update handlers -> update tests.
- Frontend: update state/store -> update UI components -> update API layer.
- Document new commands in this file when adding tooling.
