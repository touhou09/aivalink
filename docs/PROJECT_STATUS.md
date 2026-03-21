# AivaLink 프로젝트 현황 문서

> 최종 업데이트: 2026-03-18

---

## 1. 프로젝트 개요

AivaLink는 **Multi-tenant AI VTuber 플랫폼**으로, 사용자가 AI 캐릭터를 생성하고 실시간 음성/텍스트 대화를 통해 Live2D 아바타와 상호작용할 수 있는 서비스입니다.

| 항목 | 값 |
|------|-----|
| Backend | `/workspace/aivalink` — FastAPI + SQLAlchemy async + PostgreSQL |
| Frontend | `/workspace/aivalink-web` — React + TypeScript + Vite + Chakra UI v2 |
| Package Manager | uv (backend), npm (frontend) |

---

## 2. 아키텍처

### 2.1 Backend API 엔드포인트 (43개)

| 그룹 | 엔드포인트 |
|------|-----------|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/google`, `GET /api/auth/google/callback` |
| Users | `GET /api/users/me`, `PUT /api/users/me` |
| Characters | CRUD `/api/characters` |
| LLM Configs | CRUD `/api/llm-configs` |
| TTS Configs | CRUD `/api/tts-configs` |
| ASR Configs | CRUD `/api/asr-configs` |
| Files | `POST /api/files`, `GET /api/files/{id}`, `DELETE /api/files/{id}` |
| Instances | `POST /api/instances`, `GET /api/instances`, `GET /api/instances/{id}/status`, `DELETE /api/instances/{id}` |
| Conversations | `GET /api/conversations/{character_id}` |
| Agents | `GET /api/agents/mcp-status`, `GET /api/agents/tools` |
| WebSocket | `/client-ws/{instance_id}`, `/mcp-ws/{instance_id}` |
| Health | `GET /health` |

### 2.2 Frontend 라우트 (11개)

| 라우트 | 페이지 | 인증 |
|--------|--------|------|
| `/login` | LoginPage | 공개 |
| `/register` | RegisterPage | 공개 |
| `/auth/callback` | AuthCallbackPage | 공개 |
| `/dashboard` | DashboardPage | 필요 |
| `/characters/new` | CharacterEditPage | 필요 |
| `/characters/:id/edit` | CharacterEditPage | 필요 |
| `/settings/llm` | SettingsLLMPage | 필요 |
| `/settings/tts` | SettingsTTSPage | 필요 |
| `/settings/asr` | SettingsASRPage | 필요 |
| `/vtuber/:characterId` | VTuberPage | 필요 |
| `/history/:characterId` | HistoryPage | 필요 |

### 2.3 Engine Layer

| 구성요소 | 설명 |
|----------|------|
| 추상 클래스 | `BaseASR`, `BaseLLM`, `BaseTTS` + Factory 패턴 |
| Stub 구현 | `EchoLLM`, `SilentTTS`, `StubASR` (테스트용) |
| Real 구현 | `OpenAILLM`, `EdgeTTSEngine`, `FasterWhisperASR` |
| Pipeline | text/audio → ASR → LLM(streaming) → sentence split → emotion → TTS |
| Emotion | Korean+English 키워드 기반 (happy/sad/angry/surprised/neutral) |

### 2.4 Orchestration Layer

| 구성요소 | 설명 |
|----------|------|
| ToolExecutor | LLM 출력에서 JSON tool call 감지 + 실행 |
| Built-in Tools | `get_time`, `search_web` (stub) |
| MCP Server | `/mcp-ws/{instance_id}` reverse tunnel |
| MCP Client | websockets 기반 외부 MCP 서버 연결 |
| Pipeline 통합 | tool_call → `agent-tool-calling`/`agent-tool-result` WS 메시지 |

---

## 3. Phase별 구현 현황

### Phase 1: Backend Skeleton — 완료 (100%)

- DB 모델 9개: User, OAuthToken, FileUpload, LLMConfig, TTSConfig, ASRConfig, Character, Instance, ConversationLog
- JWT + OAuth2 (Google) 인증
- CRUD API 전체 구현
- 64 tests, 93% coverage

### Phase 2: VTuber Core — 완료 (100%)

- Engine 추상화 + Factory + Stub + Real 엔진
- VTuberPipeline + Emotion Analyzer + Sentence Splitter
- WebSocket handler (`/client-ws/{instance_id}`) + JWT 인증
- Instance Manager (in-memory dict 기반)
- DB Config Loader (TEST_MODE auto-stub 선택)
- Binary WebSocket audio streaming (`audio-chunk-meta` + `send_bytes`)

### Phase 3: Frontend — 부분 완료 (~60%)

**구현 완료:**
- 10개 페이지 라우트 + ProtectedRoute
- i18n: 71개 키/언어 (ko/en), 전체 페이지 적용
- Live2D: pixi.js v7 + pixi-live2d-display, 5가지 감정 모션 매핑
- Vitest: 8개 유닛 테스트 (authStore, ProtectedRoute, WebSocket)
- Zustand 상태관리, Axios JWT 인터셉터
- 대화 히스토리 UI (페이지네이션)

**미완성:**
| 항목 | 설명 |
|------|------|
| UI E2E 테스트 | 전혀 셋업되지 않음 (기존 Playwright 계획, 2026 기준 대안 도구 비교 필요) |
| Live2D 모델 선택 UI | CharacterEditPage에 모델 선택/썸네일 미구현 |
| 감정 매핑 에디터 | CharacterEditPage에 emotion_map 필드 없음 |
| temperature/max_tokens | SettingsLLMPage에 슬라이더 미구현 |
| 파일 업로드 드래그앤드롭 | 별도 업로드 컴포넌트 없음 |
| TTS 미리 듣기 | SettingsTTSPage 미구현 |
| 립싱크/마우스 트래킹 | Live2DCanvas에 기본 로드만 존재 |

### Phase 4: Orchestration — 부분 완료 (~30%)

**구현 완료:**
- ToolExecutor (tool call 감지 + 실행 + built-in tools)
- MCP Server/Client 스켈레톤
- Agent API 엔드포인트 (mcp-status, tools)
- Pipeline 통합 (tool_call → WS 메시지)

**미완성:**
| 항목 | 설명 |
|------|------|
| 실제 MCP 서버 연동 | 외부 MCP 서버와의 통합 테스트 없음 |
| GoClaw 연동 | 미구현 |

---

## 4. 테스트 현황

### 4.1 Backend: 138 tests, 85% coverage

| 테스트 파일 | 수 | 범위 |
|------------|-----|------|
| test_auth.py | 11 | 인증 (login/register/refresh/logout/OAuth) |
| test_characters.py | 10 | 캐릭터 CRUD |
| test_llm_configs.py | 9 | LLM 설정 CRUD |
| test_tts_configs.py | 7 | TTS 설정 CRUD |
| test_asr_configs.py | 7 | ASR 설정 CRUD |
| test_files.py | 8 | 파일 업로드/다운로드/삭제 |
| test_instances.py | 8 | 인스턴스 생성/목록/상태/삭제 |
| test_conversations.py | 3 | 대화 기록 조회/페이지네이션 |
| test_users.py | 6 | 사용자 프로필 |
| test_websocket.py | 7 | WebSocket (ping/text/audio/interrupt/invalid JSON) |
| test_health.py | 6 | 헬스체크/암호화/보안 |
| test_pipeline.py | 6 | VTuber 파이프라인 |
| test_engine.py | 13 | 엔진 추상화/Factory/Stub |
| test_emotion.py | 16 | 감정분석/문장분리 |
| test_config_loader.py | 4 | DB 설정 로더 |
| test_orchestrator.py | 14 | Tool 감지/실행/Agent API |
| test_mcp_client.py | 3 | MCP 클라이언트 |

**테스트 미작성 모듈:**
- `app/middleware/rate_limit.py`
- `app/mcp/server.py`
- `app/api/agents.py`
- `app/logging_config.py`
- `app/core/exceptions.py`

### 4.2 Frontend: 8 tests (3 files)

| 테스트 파일 | 수 | 범위 |
|------------|-----|------|
| authStore.test.ts | 3 | setTokens, logout, 초기 상태 |
| ProtectedRoute.test.tsx | 2 | 미인증 리다이렉트, 인증 시 렌더링 |
| websocket.test.ts | 3 | sendTextInput, disconnect, on 핸들러 |

**테스트 미작성:** 10개 페이지 컴포넌트, API client 인터셉터, Live2DCanvas, UI E2E 전반

### 4.3 UI E2E 도구 옵션 (2026 업데이트)

AivaLink의 UI E2E는 기존 Playwright 단일 계획에서 확장하여, **LLM 위임 방식**까지 고려한 3계층 전략으로 재정의합니다.

| 분류 | 도구 | 장점 | LLM 위임 난이도 | 현재 권고 |
|------|------|------|------------------|-----------|
| Agentic UI Testing | Skyvern, MultiOn, LaVague, OpenManus | 목표 기반 자율 탐색/실행, 복잡한 UI 흐름 자동화 | 낮음 | 실험/보조 검증(비핵심 회귀) |
| Natural Language / Low-Code | testRigor, Autonoma, mabl | 자연어 시나리오, 셀렉터 self-healing, 비개발자 협업 용이 | 중간 | QA 협업 시 파일럿 검토 |
| Script-based | Playwright, Cypress, WebdriverIO, Maestro(Web) | 재현성/디버깅/CI 통합 우수, 코드리뷰 기반 통제 용이 | 높음 | **주력(권장)** |

**프로젝트 권장 방향:**
- 주력 프레임워크는 **Script-based (Playwright 또는 Cypress)** 로 유지
- Agentic 도구는 smoke/regression의 보조 트랙으로 제한 도입
- LLM이 생성한 테스트 코드는 PR 리뷰 + 안정화 과정을 거친 뒤 CI에 편입
- **LLM 기반 E2E(Agentic/NL 도구 포함)는 OpenAI OAuth(구독 계정 로그인) 기준으로 환경 세팅 필요**
  - 필수: OpenAI OAuth 로그인 플로우 연결(구독 계정), 사용 모델/요금제 명시
  - 권장: 테스트 전용 워크스페이스/계정 분리, 월 예산/사용량 한도 설정, CI 비대화형 실행 시 OAuth 토큰 관리 정책 문서화

**즉시 액션 아이템 (테스트 관점):**
1. 핵심 사용자 플로우(login → character 생성 → instance 시작 → VTuber 대화) E2E 1차 자동화
2. Playwright vs Cypress 소규모 PoC(실행속도/flake율/유지보수성 비교)
3. Agentic 도구 1종(Skyvern 또는 LaVague)으로 비정형 UI smoke 실험
4. CI에 UI E2E stage 추가(실패 시 머지 차단 정책 포함)

---

## 5. 보안 점검 결과

| # | 항목 | 심각도 | 위치 | 상태 |
|---|------|--------|------|------|
| 1 | **FERNET_KEY 기본값이 실제 키로 하드코딩** | CRITICAL | `app/config.py:20` | ❌ 미수정 |
| 2 | **JWT_SECRET_KEY 기본값이 예측 가능** | HIGH | `app/config.py:14` | ❌ 미수정 |
| 3 | **WebSocket URL `ws://localhost:8000` 하드코딩** | HIGH | `app/api/instances.py:19,79` | ❌ 미수정 |
| 4 | Frontend `.gitignore`에 `.env` 미등록 | MEDIUM | `aivalink-web/.gitignore` | ❌ 미수정 |
| 5 | Frontend `.env.example` 미존재 | MEDIUM | `aivalink-web/` | ❌ 미수정 |
| 6 | CORS `allow_methods`/`allow_headers` 와일드카드 | LOW | `app/main.py:53-54` | ⚠️ 운영 시 좁힐 필요 |
| 7 | Backend `.gitignore`에 `.env` 등록 | OK | `.gitignore:24-26` | ✅ 양호 |
| 8 | `CORS_ORIGINS` 환경변수화 | OK | `app/config.py:32` | ✅ 양호 |

---

## 6. 인프라 현황

### 6.1 Docker

| 항목 | 상태 | 비고 |
|------|------|------|
| Dockerfile | ✅ | Python 3.11 + uv + uvicorn (단일 스테이지) |
| docker-compose.yml | ✅ | backend + postgres:16-alpine + redis:7-alpine |
| .dockerignore | ✅ | .venv, __pycache__, .git, .env, tests 제외 |
| Postgres healthcheck | ✅ | `pg_isready` |
| Redis healthcheck | ✅ | `redis-cli ping` |
| Backend healthcheck | ❌ | 미설정 (`/health` 엔드포인트 활용 가능) |
| Redis volume | ❌ | 재시작 시 데이터 손실 |
| Alembic 자동 실행 | ❌ | 수동 `alembic upgrade head` 필요 |
| Multi-stage build | ❌ | 이미지 크기 최적화 미적용 |

### 6.2 CI/CD (`.github/workflows/ci.yml`)

| Job | 구성 | 이슈 |
|-----|------|------|
| backend-test | postgres 서비스 + `uv sync` + `ruff check` + `pytest` | `--cov` 플래그 없음, `mypy` 미실행 |
| docker-build | `docker compose build` | — |
| frontend-build | `npm ci` + `npm run build` | `continue-on-error: true` (실패해도 CI 통과), `npm run test` 미실행 |

### 6.3 Alembic

| 항목 | 상태 |
|------|------|
| 초기 마이그레이션 | ✅ 9개 테이블 (001_initial_schema.py) |
| 모델-마이그레이션 일치 | ✅ 확인됨 |
| async engine 사용 | ✅ asyncpg |

### 6.4 pyproject.toml 이슈

- `dependency-groups.dev` (line 29-38)와 `project.optional-dependencies.dev` (line 69-75) **중복 정의**
- `pytest`, `ruff` 등이 양쪽에 다른 버전으로 명시됨

---

## 7. 남은 작업

### 7.1 Must-Have (즉시 수정 필요)

| # | 항목 | 심각도 | 설명 |
|---|------|--------|------|
| 1 | FERNET_KEY 기본값 제거 | CRITICAL | 실제 키가 소스코드에 노출. 빈 문자열 + 시작 시 검증으로 변경 |
| 2 | JWT_SECRET_KEY 기본값 제거 | HIGH | 예측 가능한 기본값. 시작 시 검증 필요 |
| 3 | WebSocket URL 설정 기반 변경 | HIGH | `instances.py`에 `ws://localhost:8000` 하드코딩 → `settings`에서 읽도록 |
| 4 | Frontend `.gitignore`에 `.env*` 추가 | MEDIUM | 환경변수 커밋 방지 |
| 5 | Frontend `.env.example` 생성 | MEDIUM | `VITE_API_URL`, `VITE_WS_URL` 문서화 |
| 6 | Docker backend healthcheck 추가 | MEDIUM | `/health` 엔드포인트 활용 |
| 7 | CI `continue-on-error` 제거 | MEDIUM | frontend-build 실패 시 CI 통과 방지 |
| 8 | pyproject.toml dev 의존성 중복 통합 | LOW | 두 정의를 하나로 합치기 |

### 7.2 Nice-to-Have (개선 사항)

| # | 항목 | 영향도 | 설명 |
|---|------|--------|------|
| 1 | UI E2E 테스트 도구 선정 + 셋업 | HIGH | Playwright/Cypress/WebdriverIO/Maestro(Web) 비교 후 주력 1종 확정, Agentic 도구는 보조 트랙으로 파일럿 |
| 2 | CI에 `--cov` + `npm run test` 추가 | MEDIUM | 커버리지 리포트, 프론트엔드 테스트 실행 |
| 3 | CI에 mypy 타입체크 추가 | MEDIUM | 설정은 있으나 CI 미실행 |
| 4 | Instance Manager Redis 영속화 | MEDIUM | 현재 in-memory dict, 서버 재시작 시 상태 손실 |
| 5 | CharacterEditPage Live2D 모델 선택 UI | MEDIUM | 썸네일 그리드, 감정 매핑 에디터 |
| 6 | SettingsLLMPage temperature/max_tokens 슬라이더 | LOW | Phase 3 계획 미구현 |
| 7 | 파일 업로드 드래그앤드롭 UI | LOW | Phase 3 계획 미구현 |
| 8 | Docker multi-stage build | LOW | 이미지 크기 최적화 |
| 9 | Alembic 자동 실행 (entrypoint) | LOW | 수동 migration 불필요하게 |
| 10 | CORS `allow_methods`/`allow_headers` 범위 좁히기 | LOW | 운영 환경 보안 강화 |
| 11 | `mcp/server`, `api/agents` 테스트 추가 | LOW | 현재 테스트 미작성 |
| 12 | Live2D 립싱크/마우스 트래킹 | LOW | Phase 3.5 계획 |
| 13 | Redis volume 추가 | LOW | docker-compose.yml 데이터 영속성 |

---

## 8. 기술 스택

| 카테고리 | 기술 |
|----------|------|
| Backend Framework | FastAPI 0.115+ |
| ORM | SQLAlchemy 2.0 (async) |
| Database | PostgreSQL 16 (asyncpg) |
| Cache | Redis 7 |
| Auth | JWT (python-jose) + OAuth2 (Google) |
| Encryption | Fernet (cryptography) |
| Logging | structlog (dev: console, prod: JSON) |
| Rate Limiting | slowapi |
| Migration | Alembic 1.14+ |
| LLM | OpenAI SDK (streaming) |
| TTS | edge-tts |
| ASR | faster-whisper (optional GPU) |
| MCP | websockets (client/server) |
| Frontend | React 19 + TypeScript + Vite 8 |
| UI | Chakra UI v2 |
| State | Zustand |
| i18n | i18next + react-i18next (71키, ko/en) |
| Live2D | pixi.js v7 + pixi-live2d-display |
| Routing | react-router-dom v7 |
| HTTP | Axios (JWT interceptor) |
| Testing (BE) | pytest + testcontainers + pytest-asyncio |
| Testing (FE) | Vitest + @testing-library/react |
| Lint | ruff |
| Container | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| Package Manager | uv (backend), npm (frontend) |
