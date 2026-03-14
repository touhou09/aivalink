# AivaLink 아키텍처 문서

## 1. 시스템 개요

AivaLink는 멀티테넌트 AI VTuber 플랫폼으로, 사용자별로 독립적인 VTuber 인스턴스를 생성하고 운영할 수 있는 서비스이다. Open-LLM-VTuber의 아키텍처를 기반으로 하되, 다음과 같은 핵심 차별점을 갖는다:

| 항목 | Open-LLM-VTuber | AivaLink |
|------|-----------------|----------|
| 설정 관리 | YAML 파일 기반 | DB + REST API 기반 |
| 운영 방식 | 단일 인스턴스 | 멀티테넌트 (사용자별 VTuber 인스턴스) |
| 에이전트 | 없음 | GoClaw/OpenClaw 기반 오케스트레이션 |
| 배포 | 로컬 실행 | 서버 배포 + MCP 리버스 터널 |
| 인증 | 없음 | JWT + Google OAuth |

### 1.1 설계 원칙

1. **멀티테넌트 격리**: 사용자별 VTuber 인스턴스는 완전히 격리되며, 설정/데이터/프로세스가 교차하지 않는다.
2. **모듈러 팩토리 패턴**: ASR, TTS, LLM 컴포넌트는 팩토리 패턴으로 교체 가능하다. 새 제공자 추가 시 기존 코드를 수정하지 않는다.
3. **DB 우선 설정**: 모든 설정은 DB에 저장하고 API로 관리한다. 환경 변수는 인프라 수준 설정에만 사용한다.
4. **비밀 정보 암호화**: API 키 등 민감 정보는 암호화하여 DB에 저장한다.
5. **수평 확장 가능**: Instance Manager는 프로세스 기반에서 컨테이너 기반으로 전환 가능하도록 추상화한다.
6. **WebSocket 프로토콜 호환**: Open-LLM-VTuber의 `/client-ws` 프로토콜을 기반으로 확장한다.

---

## 2. 레포 구조

### 2.1 Backend (aivalink)

```
aivalink/
├── app/
│   ├── main.py                    # FastAPI 앱 진입점
│   ├── config.py                  # 환경 변수 기반 앱 설정
│   ├── database.py                # SQLAlchemy 엔진/세션 설정
│   │
│   ├── api/                       # REST API 라우터
│   │   ├── __init__.py
│   │   ├── deps.py                # 공통 의존성 (DB 세션, 현재 사용자 등)
│   │   ├── auth.py                # 인증 엔드포인트
│   │   ├── users.py               # 사용자 관리
│   │   ├── characters.py          # 캐릭터 CRUD
│   │   ├── llm_configs.py         # LLM 설정 CRUD
│   │   ├── tts_configs.py         # TTS 설정 CRUD
│   │   ├── asr_configs.py         # ASR 설정 CRUD
│   │   ├── instances.py           # 인스턴스 관리
│   │   ├── files.py               # 파일 업로드 (음성 모델, Live2D 등)
│   │   └── agents.py              # 에이전트 관련 API
│   │
│   ├── models/                    # SQLAlchemy ORM 모델
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── character.py
│   │   ├── llm_config.py
│   │   ├── tts_config.py
│   │   ├── asr_config.py
│   │   ├── instance.py
│   │   └── oauth_token.py
│   │
│   ├── schemas/                   # Pydantic 스키마 (요청/응답)
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── character.py
│   │   ├── llm_config.py
│   │   ├── tts_config.py
│   │   ├── asr_config.py
│   │   └── instance.py
│   │
│   ├── services/                  # 비즈니스 로직
│   │   ├── __init__.py
│   │   ├── auth_service.py
│   │   ├── user_service.py
│   │   ├── character_service.py
│   │   ├── config_service.py
│   │   ├── instance_service.py
│   │   └── file_service.py
│   │
│   ├── core/                      # 핵심 유틸리티
│   │   ├── __init__.py
│   │   ├── security.py            # JWT, 패스워드 해싱, API 키 암호화
│   │   ├── oauth.py               # Google OAuth 클라이언트
│   │   └── exceptions.py          # 커스텀 예외
│   │
│   ├── engine/                    # VTuber 엔진 (Open-LLM-VTuber 포팅)
│   │   ├── __init__.py
│   │   ├── pipeline.py            # ASR → LLM → TTS 파이프라인
│   │   ├── websocket_handler.py   # /client-ws WebSocket 핸들러
│   │   ├── live2d_controller.py   # Live2D 감정/립싱크 제어
│   │   │
│   │   ├── asr/                   # ASR 팩토리 + 구현체
│   │   │   ├── __init__.py
│   │   │   ├── factory.py
│   │   │   ├── base.py
│   │   │   ├── whisper_asr.py
│   │   │   ├── faster_whisper.py
│   │   │   └── google_asr.py
│   │   │
│   │   ├── llm/                   # LLM 팩토리 + 구현체
│   │   │   ├── __init__.py
│   │   │   ├── factory.py
│   │   │   ├── base.py
│   │   │   ├── openai_llm.py
│   │   │   ├── claude_llm.py
│   │   │   ├── gemini_llm.py
│   │   │   └── ollama_llm.py
│   │   │
│   │   └── tts/                   # TTS 팩토리 + 구현체
│   │       ├── __init__.py
│   │       ├── factory.py
│   │       ├── base.py
│   │       ├── edge_tts.py
│   │       ├── melo_tts.py
│   │       └── gptsovits.py
│   │
│   ├── instance_manager/          # 멀티테넌트 인스턴스 관리
│   │   ├── __init__.py
│   │   ├── manager.py             # 인스턴스 생명주기 관리
│   │   ├── process_backend.py     # 프로세스 기반 스폰
│   │   └── container_backend.py   # 컨테이너 기반 스폰 (Phase 2+)
│   │
│   └── orchestrator/              # 에이전트 오케스트레이션
│       ├── __init__.py
│       ├── goclaw_client.py       # GoClaw/OpenClaw 연동
│       ├── mcp_tunnel.py          # MCP 리버스 터널
│       └── oauth_provider.py      # GPT OAuth Provider
│
├── alembic/                       # DB 마이그레이션
│   ├── alembic.ini
│   ├── env.py
│   └── versions/
│
├── tests/
│   ├── conftest.py
│   ├── test_api/
│   ├── test_engine/
│   ├── test_services/
│   └── test_instance_manager/
│
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── docker-compose.dev.yml
│
├── pyproject.toml
├── alembic.ini
└── .env.example
```

### 2.2 Frontend (aivalink-web)

```
aivalink-web/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes.tsx
│   │
│   ├── api/                       # API 클라이언트
│   │   ├── client.ts              # Axios 인스턴스 (JWT 인터셉터)
│   │   ├── auth.ts
│   │   ├── characters.ts
│   │   ├── configs.ts
│   │   ├── instances.ts
│   │   └── files.ts
│   │
│   ├── hooks/                     # React 커스텀 훅
│   │   ├── useAuth.ts
│   │   ├── useWebSocket.ts
│   │   ├── useVTuber.ts
│   │   └── useLive2D.ts
│   │
│   ├── components/                # UI 컴포넌트
│   │   ├── common/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── settings/
│   │   ├── vtuber/
│   │   │   ├── Live2DViewer.tsx   # Live2D 캔버스
│   │   │   ├── ChatPanel.tsx      # 채팅 인터페이스
│   │   │   └── VoiceInput.tsx     # 음성 입력 UI
│   │   └── layout/
│   │
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── CharacterSettingsPage.tsx
│   │   ├── LLMSettingsPage.tsx
│   │   ├── TTSSettingsPage.tsx
│   │   ├── ASRSettingsPage.tsx
│   │   └── VTuberPage.tsx
│   │
│   ├── stores/                    # 상태 관리 (Zustand 또는 Context)
│   │   ├── authStore.ts
│   │   └── vtuberStore.ts
│   │
│   └── lib/
│       ├── live2d/                # Live2D Web SDK 래퍼
│       └── websocket/             # WebSocket 프로토콜 클라이언트
│
├── public/
│   └── live2d/                    # 기본 Live2D 모델 에셋
│
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### 2.3 기술 스택 상세

| 계층 | 기술 | 버전/비고 |
|------|------|-----------|
| **Backend Framework** | FastAPI | Python 3.11+ |
| **ORM** | SQLAlchemy 2.0 | async 세션 지원 |
| **마이그레이션** | Alembic | SQLAlchemy 모델 기반 |
| **인증** | python-jose (JWT), authlib (OAuth) | |
| **비밀번호 해싱** | bcrypt via passlib | |
| **API 키 암호화** | cryptography (Fernet) | |
| **WebSocket** | FastAPI WebSocket | Starlette 기반 |
| **태스크 큐** | (선택) Celery / asyncio | 인스턴스 생명주기용 |
| **DB** | PostgreSQL 15+ | pgvector 확장 포함 |
| **캐시** | Redis 7+ | 세션, 인스턴스 상태, pub/sub |
| **파일 저장** | 로컬 FS → S3 호환 (MinIO) | 음성 모델, Live2D 에셋 |
| **Frontend Framework** | React 18 + TypeScript | |
| **빌드 도구** | Vite | |
| **UI 라이브러리** | Chakra UI v2 | |
| **Live2D** | Cubism Web SDK 5.0 | 공식 SDK |
| **상태 관리** | Zustand | 경량, TypeScript 친화적 |
| **컨테이너** | Docker + Docker Compose | |
| **에이전트** | GoClaw / OpenClaw | Go 기반 |
| **MCP** | Model Context Protocol | 리버스 터널 |

---

## 3. 시스템 아키텍처 다이어그램

### 3.1 전체 시스템 구조

```
+------------------------------------------------------------------+
|                        aivalink-web (React)                      |
|  +------------+  +----------------+  +-------------------------+ |
|  | Auth Pages |  | Settings Pages |  | VTuber Page (Live2D)    | |
|  |            |  | - Character    |  | - Live2D Canvas         | |
|  | - Login    |  | - LLM Config   |  | - Chat Panel            | |
|  | - Register |  | - TTS Config   |  | - Voice Input           | |
|  | - OAuth CB |  | - ASR Config   |  | - Agent Tool Results    | |
|  +------+-----+  +-------+--------+  +------------+------------+ |
|         |                |                         |              |
+---------|----------------|-------------------------|--------------+
          |  HTTP/REST     |  HTTP/REST              |  WebSocket
          |  (JWT Bearer)  |  (JWT Bearer)           |  (/client-ws)
          v                v                         v
+------------------------------------------------------------------+
|                     aivalink (FastAPI)                            |
|                                                                  |
|  +-------------------+  +-------------------+                    |
|  |   Platform API    |  | Instance Manager  |                    |
|  |                   |  |                   |                    |
|  | /api/auth/*       |  | spawn()           |                    |
|  | /api/users/*      |  | stop()            |                    |
|  | /api/characters/* |  | status()          |                    |
|  | /api/llm-configs/*|  | health_check()    |                    |
|  | /api/tts-configs/*|  |                   |                    |
|  | /api/asr-configs/*|  | +---------------+ |                    |
|  | /api/instances/*  |  | | Process Pool  | |                    |
|  | /api/files/*      |  | | or Container  | |                    |
|  +--------+----------+  | | Orchestrator  | |                    |
|           |              | +-------+-------+ |                    |
|           |              +---------+---------+                    |
|           |                        |                              |
|           v                        v                              |
|  +------------------------------------------------+              |
|  |          VTuber Instance (per user)             |              |
|  |                                                 |              |
|  |  +-------+    +---------+    +-------+          |              |
|  |  |  ASR  | -> |   LLM   | -> |  TTS  |         |              |
|  |  |Factory|    | Factory |    |Factory|          |              |
|  |  +-------+    +---------+    +-------+          |              |
|  |       |            |              |             |              |
|  |  +----v----+  +----v-----+  +----v-----+       |              |
|  |  |Whisper  |  |OpenAI    |  |Edge TTS  |       |              |
|  |  |Google   |  |Claude    |  |MeloTTS   |       |              |
|  |  |Faster-W |  |Gemini    |  |GPTSoVITS |       |              |
|  |  +---------+  |Ollama    |  +----------+       |              |
|  |               +----------+                      |              |
|  |                                                 |              |
|  |  +-------------------+  +--------------------+  |              |
|  |  | WebSocket Handler |  | Live2D Controller  |  |              |
|  |  | (/client-ws)      |  | (emotion, lipsync) |  |              |
|  |  +-------------------+  +--------------------+  |              |
|  +------------------------------------------------+              |
|           |                                                       |
|           v                                                       |
|  +----------------------------+                                   |
|  |   Agent Orchestrator       |                                   |
|  |                            |                                   |
|  |  +--------+  +---------+  |         +---------------------+   |
|  |  |GoClaw/ |  |  GPT    |  |         |  User's Local PC    |   |
|  |  |OpenClaw|  | OAuth   |  |  MCP    |  +---------------+  |   |
|  |  |Client  |  |Provider |  | <=====  |  | MCP Client    |  |   |
|  |  +--------+  +---------+  | Reverse |  | (File Access, |  |   |
|  |                           | Tunnel  |  |  App Control) |  |   |
|  +----------------------------+         +---------------------+   |
|                                                                   |
+----------------------+--------------------------------------------+
                       |
          +------------+------------+
          |                         |
+---------v----------+  +-----------v---------+
|   PostgreSQL       |  |      Redis          |
|                    |  |                     |
| - users            |  | - session store     |
| - characters       |  | - instance status   |
| - llm_configs      |  | - pub/sub channels  |
| - tts_configs      |  | - rate limiting     |
| - asr_configs      |  | - cache (configs)   |
| - instances        |  |                     |
| - oauth_tokens     |  |                     |
| - conversation_log |  |                     |
| - pgvector (RAG)   |  |                     |
+--------------------+  +---------------------+
```

### 3.2 요청 흐름: 실시간 대화

```
사용자 (브라우저)                     aivalink (서버)
     |                                    |
     |  1. WebSocket 연결                  |
     |  ws://host/client-ws/{instance_id} |
     | ---------------------------------> |
     |                                    |  2. JWT 검증
     |                                    |  3. 인스턴스 ID → 사용자 소유 확인
     |                                    |
     |  4. 음성 데이터 전송 (PCM/WAV)      |
     | ---------------------------------> |
     |                                    |  5. ASR: 음성 → 텍스트
     |                                    |  6. LLM: 텍스트 → 응답 (스트리밍)
     |                                    |
     |  7. 텍스트 응답 (스트리밍 chunk)     |
     | <--------------------------------- |
     |                                    |  8. TTS: 텍스트 → 음성
     |                                    |  9. 감정 분석
     |                                    |
     |  10. 오디오 chunk + 감정 태그        |
     | <--------------------------------- |
     |                                    |
     |  11. Live2D 감정 표현 변경           |
     |  12. 립싱크 재생                     |
     |  (프론트엔드 내부)                   |
     |                                    |
```

### 3.3 인스턴스 생명주기

```
   [사용자 요청: 시작]
          |
          v
   +------+------+
   | DB에서 설정  |
   | 로드         |
   +------+------+
          |
          v
   +------+------+
   | 팩토리로     |
   | ASR/LLM/TTS |
   | 인스턴스 생성|
   +------+------+
          |
          v
   +------+------+
   | 프로세스/    |
   | 컨테이너    |
   | 스폰        |
   +------+------+
          |
          v
   +------+------+      +------------------+
   | RUNNING     | ---> | 헬스체크 실패     |
   | (WebSocket  |      | → 자동 재시작     |
   |  수신 대기) |      | (최대 3회)        |
   +------+------+      +------------------+
          |
          |  [사용자 요청: 중지]
          v
   +------+------+
   | STOPPING    |
   | (정리 작업) |
   +------+------+
          |
          v
   +------+------+
   | STOPPED     |
   +-------------+

   상태값: PENDING → STARTING → RUNNING → STOPPING → STOPPED
                                            ↓
                                          ERROR
```

---

## 4. 컴포넌트별 상세 설계

### 4.1 Platform API

인증과 설정 관리를 담당하는 REST API 계층이다.

#### 4.1.1 인증 (Auth)

- **JWT 기반 인증**: Access Token (15분) + Refresh Token (7일)
- **Google OAuth 2.0**: Authorization Code Flow
- **Refresh Token Rotation**: 사용 시마다 새 Refresh Token 발급, 이전 토큰 폐기

```
POST   /api/auth/register          # 이메일/비밀번호 회원가입
POST   /api/auth/login             # 이메일/비밀번호 로그인
POST   /api/auth/refresh           # Access Token 갱신
POST   /api/auth/logout            # Refresh Token 폐기
GET    /api/auth/google            # Google OAuth 시작 (redirect)
GET    /api/auth/google/callback   # Google OAuth 콜백
```

JWT Payload 구조:
```json
{
  "sub": "user_uuid",
  "email": "user@example.com",
  "exp": 1700000000,
  "iat": 1699999100,
  "type": "access"
}
```

#### 4.1.2 사용자 관리 (Users)

```
GET    /api/users/me               # 현재 사용자 정보
PUT    /api/users/me               # 프로필 수정
DELETE /api/users/me               # 계정 삭제 (soft delete)
```

#### 4.1.3 캐릭터 관리 (Characters)

```
GET    /api/characters             # 사용자의 캐릭터 목록
POST   /api/characters             # 캐릭터 생성
GET    /api/characters/{id}        # 캐릭터 상세
PUT    /api/characters/{id}        # 캐릭터 수정
DELETE /api/characters/{id}        # 캐릭터 삭제
```

#### 4.1.4 설정 관리 (Configs)

각 설정 종류(LLM, TTS, ASR)별로 동일한 CRUD 패턴을 따른다.

```
# LLM 설정
GET    /api/llm-configs                 # 목록
POST   /api/llm-configs                 # 생성
GET    /api/llm-configs/{id}            # 상세
PUT    /api/llm-configs/{id}            # 수정
DELETE /api/llm-configs/{id}            # 삭제
GET    /api/llm-configs/providers       # 지원 제공자 목록

# TTS 설정 (동일 패턴)
GET    /api/tts-configs
POST   /api/tts-configs
...
POST   /api/tts-configs/{id}/voice-model  # 커스텀 음성 모델 업로드

# ASR 설정 (동일 패턴)
GET    /api/asr-configs
POST   /api/asr-configs
...
```

#### 4.1.5 인스턴스 관리

```
POST   /api/instances               # 인스턴스 시작 (character_id 필수)
DELETE /api/instances/{id}          # 인스턴스 중지
GET    /api/instances/{id}/status   # 인스턴스 상태 조회
GET    /api/instances               # 사용자의 인스턴스 목록
```

### 4.2 VTuber Engine

Open-LLM-VTuber의 ASR → LLM → TTS 파이프라인을 포팅한 핵심 엔진이다.

#### 4.2.1 팩토리 패턴 설계

각 컴포넌트(ASR, LLM, TTS)는 동일한 팩토리 패턴을 따른다.

```python
# 추상 베이스 클래스 예시 (LLM)
class BaseLLM(ABC):
    @abstractmethod
    async def generate(
        self,
        messages: list[dict],
        system_prompt: str,
    ) -> AsyncGenerator[str, None]:
        """스트리밍 텍스트 생성"""
        ...

    @abstractmethod
    async def generate_full(
        self,
        messages: list[dict],
        system_prompt: str,
    ) -> str:
        """전체 텍스트 생성 (비스트리밍)"""
        ...

# 팩토리
class LLMFactory:
    _registry: dict[str, type[BaseLLM]] = {
        "openai": OpenAILLM,
        "claude": ClaudeLLM,
        "gemini": GeminiLLM,
        "ollama": OllamaLLM,
    }

    @classmethod
    def create(cls, config: LLMConfig) -> BaseLLM:
        provider_cls = cls._registry.get(config.provider)
        if not provider_cls:
            raise ValueError(f"Unknown LLM provider: {config.provider}")
        return provider_cls(
            model=config.model_name,
            api_key=config.decrypted_api_key,
            **config.extra_params,
        )
```

```python
# ASR 베이스 클래스
class BaseASR(ABC):
    @abstractmethod
    async def transcribe(self, audio_data: bytes, language: str) -> str:
        ...

# TTS 베이스 클래스
class BaseTTS(ABC):
    @abstractmethod
    async def synthesize(self, text: str) -> AsyncGenerator[bytes, None]:
        """오디오 chunk를 스트리밍으로 생성"""
        ...
```

#### 4.2.2 파이프라인 실행 흐름

```python
class VTuberPipeline:
    def __init__(self, asr: BaseASR, llm: BaseLLM, tts: BaseTTS,
                 live2d: Live2DController, character: Character):
        self.asr = asr
        self.llm = llm
        self.tts = tts
        self.live2d = live2d
        self.character = character
        self.conversation_history: list[dict] = []

    async def process_audio(self, audio_data: bytes) -> AsyncGenerator:
        # 1. ASR: 음성 → 텍스트
        user_text = await self.asr.transcribe(audio_data, self.character.language)

        # 2. 대화 이력에 추가
        self.conversation_history.append({"role": "user", "content": user_text})

        # 3. LLM: 텍스트 → 응답 (스트리밍)
        full_response = ""
        async for chunk in self.llm.generate(
            messages=self.conversation_history,
            system_prompt=self.character.persona_prompt,
        ):
            full_response += chunk
            yield {"type": "text_chunk", "data": chunk}

        # 4. 감정 분석 (응답 텍스트 기반)
        emotion = self.live2d.analyze_emotion(full_response)
        yield {"type": "emotion", "data": emotion}

        # 5. TTS: 텍스트 → 음성 (스트리밍)
        async for audio_chunk in self.tts.synthesize(full_response):
            yield {"type": "audio_chunk", "data": audio_chunk}

        # 6. 대화 이력에 응답 추가
        self.conversation_history.append({"role": "assistant", "content": full_response})
```

#### 4.2.3 Live2D Controller

Live2D 감정 제어는 서버에서 감정 태그를 결정하고, 프론트엔드에서 모션을 적용한다.

```
감정 매핑 구조 (DB 저장):
{
  "happy":    {"motion_group": "Idle", "motion_index": 0, "expression": "happy"},
  "sad":      {"motion_group": "Idle", "motion_index": 1, "expression": "sad"},
  "angry":    {"motion_group": "Idle", "motion_index": 2, "expression": "angry"},
  "surprised":{"motion_group": "Idle", "motion_index": 3, "expression": "surprised"},
  "neutral":  {"motion_group": "Idle", "motion_index": 0, "expression": "neutral"}
}
```

감정 분석 방법:
1. **키워드 기반**: 응답 텍스트에서 감정 키워드 매칭 (기본)
2. **LLM 기반**: 별도 프롬프트로 감정 분류 요청 (선택, 추가 비용)
3. **하이브리드**: 키워드 우선, 모호한 경우 LLM 분류

### 4.3 Instance Manager

#### 4.3.1 설계 원칙

- 사용자당 동시 실행 가능한 인스턴스 수 제한 (기본: 1개)
- 인스턴스 간 완전한 메모리/프로세스 격리
- 비정상 종료 시 자동 정리 (좀비 프로세스 방지)
- 인스턴스 상태는 Redis에 저장 (빠른 조회)

#### 4.3.2 백엔드 추상화

```python
class InstanceBackend(ABC):
    @abstractmethod
    async def spawn(self, instance_id: str, config: InstanceConfig) -> None:
        """VTuber 인스턴스 스폰"""
        ...

    @abstractmethod
    async def stop(self, instance_id: str) -> None:
        """인스턴스 종료"""
        ...

    @abstractmethod
    async def health_check(self, instance_id: str) -> bool:
        """인스턴스 상태 확인"""
        ...

class ProcessBackend(InstanceBackend):
    """Phase 2: 프로세스 기반 인스턴스 관리"""
    # asyncio.subprocess로 별도 프로세스 스폰
    # 각 프로세스는 자체 WebSocket 서버를 바인딩

class ContainerBackend(InstanceBackend):
    """Phase 2+: 컨테이너 기반 인스턴스 관리 (향후)"""
    # Docker SDK로 컨테이너 스폰
    # 네트워크 격리, 리소스 제한 지원
```

#### 4.3.3 인스턴스 상태 관리 (Redis)

```
키 구조:
  instance:{instance_id}:status    → "running" | "stopped" | "error"
  instance:{instance_id}:port      → 8001 (동적 할당된 포트)
  instance:{instance_id}:started   → 1699999100 (unix timestamp)
  instance:{instance_id}:user      → "user_uuid"
  user:{user_id}:instances         → Set{"instance_id_1", "instance_id_2"}
```

#### 4.3.4 포트 할당 전략

- 프로세스 모드: 8001~8999 범위에서 동적 할당
- 메인 서버(FastAPI)가 리버스 프록시 역할로 WebSocket을 해당 포트로 라우팅
- 외부에는 `/client-ws/{instance_id}` 단일 엔드포인트만 노출

```
클라이언트 → /client-ws/{instance_id} → FastAPI (리버스 프록시)
                                            ↓
                                    Redis에서 포트 조회
                                            ↓
                                    ws://localhost:{port}/ws
                                    (내부 인스턴스 WebSocket)
```

### 4.4 WebSocket Protocol (/client-ws)

Open-LLM-VTuber의 프로토콜을 기반으로 확장한다.

#### 4.4.1 연결

```
ws://{host}/client-ws/{instance_id}?token={jwt_access_token}
```

연결 시 서버는:
1. JWT 토큰 검증
2. instance_id의 소유자가 현재 사용자인지 확인
3. 인스턴스가 RUNNING 상태인지 확인
4. WebSocket 연결 수락 후 초기 상태 전송

#### 4.4.2 메시지 타입 (Client → Server)

```json
// 텍스트 입력
{
  "type": "text-input",
  "data": {
    "text": "안녕하세요!"
  }
}

// 음성 데이터 (PCM 16-bit, 16kHz, mono)
{
  "type": "audio-input",
  "data": {
    "audio": "<base64-encoded PCM data>",
    "sample_rate": 16000,
    "channels": 1
  }
}

// 음성 중단 (현재 TTS 재생 중단)
{
  "type": "interrupt",
  "data": {}
}

// 마우스 위치 (Live2D 트래킹용)
{
  "type": "mouse-position",
  "data": {
    "x": 0.5,
    "y": 0.3
  }
}

// 에이전트 도구 실행 요청
{
  "type": "agent-tool-request",
  "data": {
    "tool_name": "read_file",
    "parameters": {
      "path": "/Users/user/document.txt"
    }
  }
}
```

#### 4.4.3 메시지 타입 (Server → Client)

```json
// 연결 성공 및 초기 상태
{
  "type": "connected",
  "data": {
    "instance_id": "uuid",
    "character": {
      "name": "아이바",
      "live2d_model": "haru",
      "emotion_map": {...}
    }
  }
}

// ASR 결과 (사용자 발화 텍스트)
{
  "type": "user-transcript",
  "data": {
    "text": "안녕하세요!",
    "is_final": true
  }
}

// LLM 텍스트 응답 (스트리밍 chunk)
{
  "type": "text-chunk",
  "data": {
    "text": "안녕",
    "is_final": false
  }
}

// LLM 응답 완료
{
  "type": "text-complete",
  "data": {
    "full_text": "안녕하세요! 오늘 기분이 어떠세요?"
  }
}

// TTS 오디오 chunk
{
  "type": "audio-chunk",
  "data": {
    "audio": "<base64-encoded PCM data>",
    "sample_rate": 24000,
    "is_final": false
  }
}

// 감정 변경
{
  "type": "emotion",
  "data": {
    "emotion": "happy",
    "motion_group": "Idle",
    "motion_index": 0,
    "expression": "happy"
  }
}

// 립싱크 데이터
{
  "type": "lipsync",
  "data": {
    "mouth_open": 0.7,
    "timestamp": 1699999100.5
  }
}

// 에이전트 도구 실행 결과
{
  "type": "agent-tool-result",
  "data": {
    "tool_name": "read_file",
    "success": true,
    "result": "파일 내용..."
  }
}

// 에러
{
  "type": "error",
  "data": {
    "code": "ASR_FAILED",
    "message": "음성 인식에 실패했습니다."
  }
}
```

### 4.5 Agent Orchestrator

#### 4.5.1 GoClaw/OpenClaw 연동

GoClaw/OpenClaw는 Go 기반 에이전트 오케스트레이션 프레임워크로, LLM이 외부 도구를 호출할 수 있게 한다.

```
연동 구조:

VTuber Instance (Python)
    ↓ gRPC / HTTP
GoClaw/OpenClaw Server
    ↓ tool call
+---+---+---+---+
| Tool A | Tool B | ...
+---------+-------+

도구 예시:
- 웹 검색
- 파일 읽기/쓰기 (MCP 경유)
- 캘린더 조회
- 메일 전송
- 커스텀 API 호출
```

#### 4.5.2 MCP 리버스 터널

MCP(Model Context Protocol) 리버스 터널은 서버에 배포된 VTuber 인스턴스가 사용자의 로컬 PC 리소스에 접근할 수 있게 한다.

```
+-------------------+         +--------------------+        +------------------+
| AivaLink Server   |         |   인터넷            |        | User's Local PC  |
|                   |         |                    |        |                  |
| VTuber Instance   |         |                    |        | MCP Client       |
|   ↓               |         |                    |        |   ↓              |
| Agent Orchestrator| ------> | MCP Reverse Tunnel | <----- | Outbound conn    |
|   ↓               |         |   (WebSocket)      |        |   ↓              |
| MCP Server (Hub)  |         |                    |        | Local Resources  |
|                   |         |                    |        | - Files          |
+-------------------+         +--------------------+        | - Applications   |
                                                            | - Clipboard      |
                                                            +------------------+
```

동작 원리:
1. 사용자가 로컬 PC에 AivaLink MCP Client를 설치/실행한다.
2. MCP Client가 AivaLink 서버로 아웃바운드 WebSocket 연결을 맺는다 (NAT/방화벽 통과).
3. VTuber 인스턴스의 에이전트가 도구 호출 시, MCP Hub를 통해 해당 사용자의 MCP Client로 요청을 전달한다.
4. MCP Client가 로컬 리소스에 접근하여 결과를 반환한다.

#### 4.5.3 GPT OAuth Provider

AivaLink가 OAuth Provider로 동작하여, 외부 GPT/에이전트에서 AivaLink API를 호출할 수 있게 한다.

```
GPT Action → OAuth 인증 → AivaLink API → VTuber 인스턴스 제어
```

---

## 5. DB 스키마 설계

### 5.1 ERD (논리적 구조)

```
+------------------+       +--------------------+       +------------------+
|     users        |       |    characters       |       |   llm_configs    |
+------------------+       +--------------------+       +------------------+
| id (UUID, PK)   |<--+   | id (UUID, PK)      |   +-->| id (UUID, PK)   |
| email            |   |   | user_id (FK)       |---+   | user_id (FK)    |
| password_hash    |   +---| name               |       | name             |
| display_name     |       | persona_prompt     |       | provider         |
| avatar_url       |       | live2d_model_id    |       | model_name       |
| is_active        |       | emotion_map (JSON) |       | api_key_enc      |
| created_at       |       | llm_config_id (FK) |---+   | oauth_token_id   |
| updated_at       |       | tts_config_id (FK) |---+   | extra_params     |
+------------------+       | asr_config_id (FK) |---+   | created_at       |
        |                  | language            |   |   +------------------+
        |                  | created_at          |   |
        |                  +--------------------+   |   +------------------+
        |                                           |   |   tts_configs    |
        |   +--------------------+                  +-->+------------------+
        |   |    instances       |                  |   | id (UUID, PK)   |
        |   +--------------------+                  |   | user_id (FK)    |
        +-->| id (UUID, PK)      |                  |   | name             |
            | user_id (FK)       |                  |   | engine           |
            | character_id (FK)  |                  |   | voice_model_path |
            | status             |                  |   | language          |
            | port               |                  |   | extra_params     |
            | started_at         |                  |   | created_at       |
            | stopped_at         |                  |   +------------------+
            | error_message      |                  |
            | created_at         |                  |   +------------------+
            +--------------------+                  |   |   asr_configs    |
                                                    +-->+------------------+
        +--------------------+                          | id (UUID, PK)   |
        |   oauth_tokens     |                          | user_id (FK)    |
        +--------------------+                          | name             |
        | id (UUID, PK)      |                          | engine           |
        | user_id (FK)       |                          | language          |
        | provider           |                          | extra_params     |
        | access_token_enc   |                          | created_at       |
        | refresh_token_enc  |                          +------------------+
        | expires_at         |
        | scopes             |
        | created_at         |     +-------------------------+
        +--------------------+     |   conversation_logs     |
                                   +-------------------------+
+---------------------+           | id (UUID, PK)           |
|   file_uploads      |           | instance_id (FK)        |
+---------------------+           | user_id (FK)            |
| id (UUID, PK)       |           | role                    |
| user_id (FK)        |           | content                 |
| file_type           |           | emotion                 |
| original_name       |           | created_at              |
| stored_path         |           +-------------------------+
| file_size           |
| mime_type           |           +-------------------------+
| created_at          |           |   embeddings            |
+---------------------+           +-------------------------+
                                  | id (UUID, PK)           |
                                  | user_id (FK)            |
                                  | character_id (FK)       |
                                  | content                 |
                                  | embedding (vector)      |
                                  | metadata (JSON)         |
                                  | created_at              |
                                  +-------------------------+
```

### 5.2 테이블 상세

#### users
```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255),          -- OAuth 전용 사용자는 NULL
    display_name    VARCHAR(100) NOT NULL,
    avatar_url      VARCHAR(500),
    auth_provider   VARCHAR(20) DEFAULT 'local',  -- 'local', 'google'
    is_active       BOOLEAN DEFAULT TRUE,
    max_instances   INTEGER DEFAULT 1,     -- 동시 인스턴스 제한
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### characters
```sql
CREATE TABLE characters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    persona_prompt  TEXT NOT NULL,
    live2d_model_id VARCHAR(100) NOT NULL DEFAULT 'haru',
    emotion_map     JSONB NOT NULL DEFAULT '{}',
    llm_config_id   UUID REFERENCES llm_configs(id) ON DELETE SET NULL,
    tts_config_id   UUID REFERENCES tts_configs(id) ON DELETE SET NULL,
    asr_config_id   UUID REFERENCES asr_configs(id) ON DELETE SET NULL,
    language        VARCHAR(10) DEFAULT 'ko',
    is_default      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_characters_user_id ON characters(user_id);
```

#### llm_configs
```sql
CREATE TABLE llm_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,  -- 사용자 지정 이름 (예: "내 GPT-4")
    provider        VARCHAR(50) NOT NULL,   -- 'openai', 'claude', 'gemini', 'ollama'
    model_name      VARCHAR(100) NOT NULL,  -- 'gpt-4o', 'claude-3-5-sonnet', etc.
    api_key_enc     BYTEA,                  -- Fernet 암호화된 API 키
    oauth_token_id  UUID REFERENCES oauth_tokens(id),
    base_url        VARCHAR(500),           -- Ollama 등 커스텀 엔드포인트
    temperature     FLOAT DEFAULT 0.7,
    max_tokens      INTEGER DEFAULT 2048,
    extra_params    JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_llm_configs_user_id ON llm_configs(user_id);
```

#### tts_configs
```sql
CREATE TABLE tts_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    engine          VARCHAR(50) NOT NULL,   -- 'edge_tts', 'melo_tts', 'gptsovits'
    voice_name      VARCHAR(100),           -- 엔진 내장 음성 이름
    voice_model_path VARCHAR(500),          -- 커스텀 음성 모델 파일 경로
    language        VARCHAR(10) DEFAULT 'ko',
    speed           FLOAT DEFAULT 1.0,
    extra_params    JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### asr_configs
```sql
CREATE TABLE asr_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    engine          VARCHAR(50) NOT NULL,   -- 'whisper', 'faster_whisper', 'google'
    model_size      VARCHAR(20) DEFAULT 'base',  -- tiny, base, small, medium, large
    language        VARCHAR(10) DEFAULT 'ko',
    extra_params    JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### instances
```sql
CREATE TABLE instances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id    UUID NOT NULL REFERENCES characters(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- 'pending', 'starting', 'running', 'stopping', 'stopped', 'error'
    port            INTEGER,
    pid             INTEGER,                -- 프로세스 모드에서 PID
    container_id    VARCHAR(100),           -- 컨테이너 모드에서 ID
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    stopped_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_instances_user_id ON instances(user_id);
CREATE INDEX idx_instances_status ON instances(status);
```

#### oauth_tokens
```sql
CREATE TABLE oauth_tokens (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider          VARCHAR(50) NOT NULL,   -- 'google', 'openai', etc.
    access_token_enc  BYTEA NOT NULL,
    refresh_token_enc BYTEA,
    token_type        VARCHAR(20) DEFAULT 'bearer',
    expires_at        TIMESTAMPTZ,
    scopes            TEXT[],
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_oauth_tokens_user_id ON oauth_tokens(user_id);
```

#### conversation_logs
```sql
CREATE TABLE conversation_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id     UUID REFERENCES instances(id) ON DELETE SET NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id    UUID NOT NULL REFERENCES characters(id),
    role            VARCHAR(20) NOT NULL,   -- 'user', 'assistant'
    content         TEXT NOT NULL,
    emotion         VARCHAR(50),
    audio_duration  FLOAT,                  -- 초 단위
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversation_logs_user_character
    ON conversation_logs(user_id, character_id, created_at DESC);
```

#### embeddings (pgvector)
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id    UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    embedding       vector(1536),           -- OpenAI ada-002 기준
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_embeddings_vector
    ON embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

#### file_uploads
```sql
CREATE TABLE file_uploads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_type       VARCHAR(50) NOT NULL,   -- 'voice_model', 'live2d_model', 'avatar'
    original_name   VARCHAR(255) NOT NULL,
    stored_path     VARCHAR(500) NOT NULL,
    file_size       BIGINT NOT NULL,
    mime_type       VARCHAR(100),
    checksum_sha256 VARCHAR(64),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_file_uploads_user_id ON file_uploads(user_id);
```

---

## 6. 인프라 구조

### 6.1 Docker Compose (개발 환경)

```yaml
# docker-compose.dev.yml
version: "3.9"

services:
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - ./app:/app/app
      - ./uploads:/app/uploads
    environment:
      - DATABASE_URL=postgresql+asyncpg://aivalink:password@db:5432/aivalink
      - REDIS_URL=redis://redis:6379/0
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
      - FERNET_KEY=${FERNET_KEY}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  db:
    image: pgvector/pgvector:pg16
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=aivalink
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=aivalink
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aivalink"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
  redisdata:
```

### 6.2 프로덕션 배포 구조

```
                    +-------------+
                    |   Nginx     |
                    | (TLS 종료,  |
                    |  정적 파일)  |
                    +------+------+
                           |
              +------------+------------+
              |                         |
    +---------v---------+     +---------v---------+
    | aivalink (FastAPI) |     | aivalink-web      |
    | (Uvicorn x N 워커) |     | (Vite build →     |
    |                    |     |  Nginx static)     |
    +---------+----------+     +--------------------+
              |
    +---------+----------+
    |                    |
+---v----+         +-----v-----+
|PostgreSQL|       |   Redis    |
| + pgvector|      |            |
+-----------+      +------------+
```

---

## 7. 보안

### 7.1 인증 및 권한

| 항목 | 구현 |
|------|------|
| 비밀번호 저장 | bcrypt (salt rounds: 12) |
| JWT Access Token | HS256, 만료 15분 |
| JWT Refresh Token | HS256, 만료 7일, DB에 해시 저장, 회전 방식 |
| Google OAuth | Authorization Code Flow + PKCE |
| API 보호 | 모든 엔드포인트에 JWT Bearer 인증 (auth 제외) |
| WebSocket 인증 | 연결 시 query param으로 JWT 전달, 연결 후 검증 |

### 7.2 API 키 암호화

사용자가 입력한 외부 서비스 API 키(OpenAI, Claude 등)는 Fernet 대칭 암호화로 DB에 저장한다.

```python
from cryptography.fernet import Fernet

class APIKeyEncryptor:
    def __init__(self, key: bytes):
        self.fernet = Fernet(key)

    def encrypt(self, api_key: str) -> bytes:
        return self.fernet.encrypt(api_key.encode())

    def decrypt(self, encrypted: bytes) -> str:
        return self.fernet.decrypt(encrypted).decode()
```

- Fernet 키는 환경 변수(`FERNET_KEY`)로 관리한다.
- DB 백업 시 Fernet 키가 포함되지 않으므로, 백업만으로는 API 키 복호화가 불가능하다.
- 키 로테이션 시 MultiFernet을 사용하여 이전 키로 암호화된 데이터도 복호화 가능하게 한다.

### 7.3 입력 검증

- Pydantic v2 모델로 모든 API 입력을 검증한다.
- 파일 업로드 시 MIME 타입, 확장자, 파일 크기를 검증한다.
- 음성 모델 파일: 최대 500MB, 허용 확장자 (.pth, .onnx, .bin)
- Live2D 모델: 최대 100MB, 허용 확장자 (.zip 아카이브 내 .moc3, .model3.json 등)

### 7.4 멀티테넌트 격리

- 모든 DB 쿼리에 `user_id` 필터를 적용한다 (서비스 레이어에서 강제).
- 인스턴스 간 프로세스/메모리 격리.
- 파일 저장 경로에 `user_id` 디렉토리를 포함하여 경로 탐색 공격을 방지한다.
  - 예: `/uploads/{user_id}/voice_models/{file_id}.pth`
- WebSocket 연결 시 인스턴스 소유권을 반드시 확인한다.

---

## 8. 확장성 고려 사항

### 8.1 수평 확장

| 컴포넌트 | 확장 전략 |
|----------|-----------|
| FastAPI 서버 | Uvicorn 워커 수 증가 → 로드 밸런서 뒤 다중 서버 |
| VTuber 인스턴스 | 프로세스 → 컨테이너 → Kubernetes Pod |
| PostgreSQL | Read Replica (읽기 부하 분산) |
| Redis | Redis Cluster (세션/상태 분산) |
| 파일 저장 | 로컬 FS → S3 호환 (MinIO/AWS S3) |

### 8.2 성능 최적화 포인트

1. **설정 캐싱**: 자주 조회되는 캐릭터/LLM/TTS/ASR 설정을 Redis에 캐싱 (TTL: 5분)
2. **WebSocket 커넥션 풀**: 인스턴스당 최대 WebSocket 연결 수 제한
3. **TTS 캐싱**: 동일 텍스트+설정 조합의 TTS 결과를 캐싱 (자주 반복되는 인사말 등)
4. **Embedding 배치 처리**: 대화 로그의 임베딩 생성을 배치로 처리 (실시간 대화 성능에 영향 최소화)

### 8.3 모니터링

- **인스턴스 헬스체크**: 30초 간격으로 Redis 기반 heartbeat
- **메트릭 수집**: Prometheus + Grafana (응답 시간, 인스턴스 수, 에러율)
- **로그 집계**: 구조화된 JSON 로그 → ELK 스택 또는 Loki
- **알림**: 인스턴스 비정상 종료, API 에러율 임계값 초과 시 알림

### 8.4 향후 확장 계획

1. **GPU 리소스 관리**: TTS/ASR 모델이 GPU를 필요로 하는 경우, GPU 스케줄링 레이어 추가
2. **다국어 지원**: i18n 프레임워크 적용 (API 응답 메시지, 프론트엔드)
3. **플러그인 시스템**: 커뮤니티 제작 ASR/TTS/LLM 플러그인 설치 메커니즘
4. **스트리밍 플랫폼 연동**: OBS 가상 카메라 출력, YouTube/Twitch 방송 연동
