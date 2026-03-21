# AivaLink 개발 로그

> 최종 업데이트: 2026-03-21

---

## 프로젝트 구조

```
workspace/
├── aivalink/              # Backend (FastAPI)
│   ├── app/
│   │   ├── api/           # REST API 엔드포인트
│   │   ├── engine/        # ASR/LLM/TTS 엔진 + 파이프라인
│   │   ├── instance_manager/  # 인스턴스 생명주기 + Redis
│   │   ├── middleware/    # Rate limiting
│   │   ├── models/        # SQLAlchemy DB 모델
│   │   ├── mcp/           # MCP 서버/클라이언트
│   │   ├── orchestrator/  # Tool executor
│   │   ├── schemas/       # Pydantic 스키마
│   │   ├── ws/            # WebSocket 핸들러
│   │   └── core/          # 보안, 예외처리
│   ├── alembic/           # DB 마이그레이션
│   ├── tests/             # 149 tests
│   ├── docs/              # 기획서, 아키텍처, 상태 문서
│   ├── scripts/           # 로컬 배포 스크립트
│   ├── Dockerfile         # Multi-stage build
│   ├── docker-compose.yml # postgres + redis + backend
│   └── Caddyfile          # HTTPS reverse proxy
│
└── aivalink-web/          # Frontend (React + Vite)
    ├── src/
    │   ├── pages/         # 11개 페이지 컴포넌트
    │   ├── components/    # Live2DCanvas, FileUpload 등
    │   ├── hooks/canvas/  # Live2D model/resize/expression
    │   ├── stores/        # Zustand (authStore)
    │   ├── api/           # Axios client + JWT interceptor
    │   ├── lib/           # WebSocket client
    │   ├── i18n/          # 71키 (ko/en)
    │   ├── context/       # Live2D config context
    │   └── WebSDK/        # Cubism WebSDK (from Open-LLM-VTuber)
    ├── public/
    │   ├── models/        # Live2D 모델 파일 (Hiyori, Haru)
    │   ├── libs/          # ONNX WASM 파일
    │   ├── live2d.min.js
    │   └── live2dcubismcore.min.js
    ├── electron/          # Electron main/preload
    ├── e2e/               # Playwright E2E specs
    └── tests/             # Vitest 8 tests

GitHub:
  Backend:  https://github.com/touhou09/aivalink
  Frontend: https://github.com/touhou09/aivalink-web
```

---

## 기능별 구현 상태

### 1. 인증 (Auth)

| 기능 | 상태 | 파일 |
|------|------|------|
| 이메일/비밀번호 회원가입 | ✅ | `api/auth.py` |
| 이메일/비밀번호 로그인 | ✅ | `api/auth.py` |
| JWT 토큰 발급/갱신 | ✅ | `core/security.py` |
| Google OAuth | ⚠️ 코드 있음, Client ID 미설정 | `api/auth.py` |
| Rate limiting | ✅ login 5/min, register 3/min | `middleware/rate_limit.py` |

### 2. 캐릭터 관리

| 기능 | 상태 | 파일 |
|------|------|------|
| 캐릭터 CRUD | ✅ | `api/characters.py` |
| Live2D 모델 URL 설정 | ✅ VARCHAR(500) | `models/character.py` |
| 감정 매핑 (emotion_map) | ✅ JSONB | `models/character.py` |
| 페르소나 프롬프트 | ✅ | |

### 3. 엔진 설정 (Config)

#### LLM
| Provider | 상태 | 파일 |
|----------|------|------|
| OpenAI | ✅ | `engine/llm/openai_llm.py` |
| OpenRouter | ✅ | `engine/llm/openrouter_llm.py` |
| Ollama (로컬) | ✅ | `engine/llm/ollama_llm.py` |
| Stub (Echo) | ✅ | `engine/llm/stub.py` |

#### TTS
| Engine | 상태 | 파일 |
|--------|------|------|
| Edge TTS | ✅ 무료, 다국어 | `engine/tts/edge_tts_engine.py` |
| Stub (Silent) | ✅ | `engine/tts/stub.py` |

#### ASR
| Engine | 상태 | 파일 |
|--------|------|------|
| Faster Whisper | ✅ 로컬 CPU | `engine/asr/faster_whisper_asr.py` |
| OpenAI Whisper | ✅ 클라우드 | `engine/asr/openai_whisper_asr.py` |
| Web Speech API | ✅ 브라우저 | `engine/asr/web_speech_asr.py` |
| Stub | ✅ | `engine/asr/stub.py` |

### 4. VTuber 파이프라인

| 기능 | 상태 | 파일 |
|------|------|------|
| text → LLM(streaming) → sentence split → TTS → audio | ✅ | `engine/pipeline.py` |
| audio → ASR → LLM → TTS | ✅ | `engine/pipeline.py` |
| 감정 태그 ([happy] [sad] 등) LLM → 추출 → 프론트 전달 | ✅ | `engine/pipeline.py` |
| 키워드 기반 감정 분석 (fallback) | ✅ | `engine/emotion.py` |
| Binary WebSocket 오디오 스트리밍 | ✅ | `ws/handler.py` |
| 대화 기록 DB 저장 (user + assistant) | ✅ | `ws/handler.py` |
| Tool call 감지/실행 | ✅ | `orchestrator/tool_executor.py` |
| Interrupt (음성 중단) | ✅ | `engine/pipeline.py` |

### 5. 인스턴스 관리

| 기능 | 상태 | 파일 |
|------|------|------|
| 인스턴스 생성/삭제/목록/상태 | ✅ | `instance_manager/manager.py` |
| 동시 인스턴스 제한 | ✅ MAX_INSTANCES_PER_USER | |
| Redis 상태 영속화 | ✅ graceful fallback | `instance_manager/redis_store.py` |

### 6. Live2D 렌더링 (Frontend)

| 기능 | 상태 | 파일 |
|------|------|------|
| Cubism WebSDK (3-5) | ✅ Open-LLM-VTuber 방식 | `WebSDK/` |
| 모델 로딩 (URL/로컬) | ✅ | `hooks/canvas/use-live2d-model.ts` |
| 감정 → 모션 재생 | ✅ idle 자동반복 비활성화 | `components/Live2DCanvas.tsx` |
| 마우스 트래킹 (시선) | ✅ | `components/Live2DCanvas.tsx` |
| 립싱크 (AudioAnalyser) | ✅ | `components/Live2DCanvas.tsx` |
| 로컬 모델 호스팅 | ✅ `public/models/` | Hiyori, Haru |

### 7. 음성 입력 (Mic/VAD)

| 기능 | 상태 | 비고 |
|------|------|------|
| Web Audio API VAD | ✅ 볼륨 기반 음성 감지 | `VTuberPage.tsx` |
| Float32 → WAV 변환 | ✅ | `VTuberPage.tsx` |
| HTTPS 필수 (LAN IP) | ⚠️ 자체 서명 인증서 방식 | `vite.config.ts` |
| localhost | ✅ HTTP에서도 동작 | |
| Electron | ✅ HTTPS 불필요 | `electron/main.ts` |

### 8. 프론트엔드 페이지

| 페이지 | 라우트 | 상태 |
|--------|--------|------|
| 로그인 | `/login` | ✅ |
| 회원가입 | `/register` | ✅ |
| OAuth 콜백 | `/auth/callback` | ✅ |
| 대시보드 | `/dashboard` | ✅ 인스턴스 자동 갱신 |
| 캐릭터 생성/편집 | `/characters/new`, `/:id/edit` | ✅ Live2D + 감정매핑 |
| LLM 설정 | `/settings/llm` | ✅ temperature/maxTokens |
| TTS 설정 | `/settings/tts` | ✅ |
| ASR 설정 | `/settings/asr` | ✅ 3종 엔진 선택 |
| VTuber | `/vtuber/:characterId` | ✅ |
| 대화 히스토리 | `/history/:characterId` | ✅ |

### 9. 인프라

| 항목 | 상태 | 파일 |
|------|------|------|
| Docker multi-stage build | ✅ | `Dockerfile` |
| Docker Compose (3 서비스) | ✅ postgres + redis + backend | `docker-compose.yml` |
| Alembic migration | ✅ 9 테이블 + 자동실행 | `alembic/` |
| GitHub Actions CI | ✅ lint + test + mypy + build | `.github/workflows/ci.yml` |
| Caddy HTTPS proxy | ✅ | `Caddyfile` |
| 로컬 배포 스크립트 | ✅ | `scripts/local-deploy.sh` |

### 10. Electron 데스크톱 앱

| 항목 | 상태 | 파일 |
|------|------|------|
| Main process | ✅ | `electron/main.ts` |
| Preload script | ✅ | `electron/preload.ts` |
| electron-vite 설정 | ✅ | `electron.vite.config.ts` |
| electron-builder 설정 | ✅ | `electron-builder.yml` |
| 빌드 scripts | ✅ mac/win/linux | `package.json` |

---

## 해결된 주요 이슈

### Live2D
- **pixi-live2d-display + pixi v7 호환 불가** → Cubism WebSDK로 전환 (Open-LLM-VTuber 방식)
- **Cubism 2 미지원** → Cubism 3-5 모델만 사용 (.model3.json)
- **CDN 모델 파일 누락** → 로컬 `public/models/`에 전체 파일 다운로드
- **idle 모션 자동 반복** → `lappmodel.ts`에서 자동 재생 비활성화

### 감정 시스템
- **키워드 매칭 부정확** → LLM이 직접 `[happy]` 태그 출력하도록 system prompt 추가
- **emotion_map str/dict 호환** → `isinstance` 분기 추가
- **TTS에 감정 태그 전달** → `display_text`에서 태그 제거 후 TTS

### WebSocket
- **asyncpg 세션 충돌** → 짧은 수명 세션 + NullPool (테스트)
- **assistant 응답 미저장** → emotion_map 타입 에러로 파이프라인 중단 → 수정
- **instance_id vs character_id** → VTuberPage에서 인스턴스 조회 후 연결

### 마이크/HTTPS
- **HTTP에서 getUserMedia 차단** → HTTPS 자체 서명 인증서 방식
- **mkcert sudo 실패** → openssl로 직접 인증서 생성 (SAN 포함)
- **Electron은 HTTPS 불필요** → file:// 프로토콜로 마이크 자유 접근

### API 호환
- **FastAPI 307 리다이렉트** → axios interceptor에서 trailing slash 자동 추가
- **paginated 응답 ({items: []})** → `Array.isArray` 체크 + `.items` fallback
- **structlog PrintLoggerFactory** → `stdlib.LoggerFactory`로 교체 (add_logger_name 호환)

---

## 테스트 현황

### Backend: 149 tests
```
test_auth.py          11   인증
test_characters.py    10   캐릭터 CRUD
test_llm_configs.py    9   LLM 설정
test_tts_configs.py    7   TTS 설정
test_asr_configs.py    7   ASR 설정
test_files.py          8   파일 업로드
test_instances.py      8   인스턴스 관리
test_conversations.py  3   대화 히스토리
test_users.py          6   사용자
test_websocket.py      7   WebSocket (text/audio/interrupt)
test_health.py         6   헬스체크/암호화
test_pipeline.py       6   파이프라인
test_engine.py        13   엔진 Factory/Stub
test_emotion.py       16   감정/문장분리
test_config_loader.py  4   설정 로더
test_orchestrator.py  14   Tool/Agent API
test_mcp_server.py    11   MCP 서버
test_mcp_client.py     3   MCP 클라이언트
```

### Frontend: 8 vitest + 6 e2e specs
```
authStore.test.ts       3   setTokens, logout, 초기상태
ProtectedRoute.test.tsx 2   리다이렉트
websocket.test.ts       3   send, disconnect, handler
e2e/auth.spec.ts        3   로그인 페이지 렌더링
e2e/navigation.spec.ts  3   미인증 리다이렉트
```

---

## 배포 방법

### 로컬 개발
```bash
# Backend
cd ~/workspace/aivalink
docker compose up -d postgres redis
uv run alembic upgrade head
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend (웹)
cd ~/workspace/aivalink-web
npm run dev

# Frontend (Electron)
npm run dev:electron
```

### 프로덕션
```bash
# Docker 전체 실행
docker compose up -d

# 또는 Vercel (프론트엔드)
vercel deploy
```

### 테스트 계정
- Email: `test@aivalink.com`
- Password: `Test1234!`

---

## 기술 스택 요약

| 영역 | 기술 |
|------|------|
| Backend | FastAPI, SQLAlchemy async, PostgreSQL, Redis, Alembic |
| Auth | JWT (python-jose), OAuth2 (Google), Fernet encryption |
| LLM | OpenAI SDK (OpenAI/OpenRouter/Ollama) |
| TTS | edge-tts |
| ASR | faster-whisper, OpenAI Whisper API |
| Live2D | Cubism WebSDK 5.0 (from Open-LLM-VTuber) |
| Frontend | React 19, TypeScript, Vite 8, Chakra UI v2, Zustand |
| Desktop | Electron + electron-vite |
| i18n | i18next (ko/en) |
| Logging | structlog |
| CI/CD | GitHub Actions, Docker, Caddy |
| Testing | pytest (149), Vitest (8), Playwright (6 specs) |
