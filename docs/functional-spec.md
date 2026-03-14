# AivaLink 기능 명세서

## 1. 기능 목록 (Phase별)

### Phase 1: Backend Skeleton

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|----------|
| F1.1 | 이메일 회원가입 | 이메일/비밀번호 기반 계정 생성 | 필수 |
| F1.2 | 이메일 로그인 | JWT Access/Refresh Token 발급 | 필수 |
| F1.3 | Google OAuth 로그인 | Authorization Code Flow | 필수 |
| F1.4 | JWT 갱신 | Refresh Token으로 Access Token 재발급 | 필수 |
| F1.5 | 로그아웃 | Refresh Token 폐기 | 필수 |
| F1.6 | 사용자 프로필 관리 | 조회/수정/삭제 | 필수 |
| F1.7 | 캐릭터 CRUD | 생성/조회/수정/삭제 | 필수 |
| F1.8 | LLM 설정 CRUD | 제공자, 모델, API 키 관리 | 필수 |
| F1.9 | TTS 설정 CRUD | 엔진, 음성, 언어 관리 | 필수 |
| F1.10 | ASR 설정 CRUD | 엔진, 모델 크기, 언어 관리 | 필수 |
| F1.11 | DB 스키마 및 마이그레이션 | Alembic 기반 | 필수 |
| F1.12 | API 키 암호화 저장 | Fernet 대칭 암호화 | 필수 |

### Phase 2: VTuber Core

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|----------|
| F2.1 | ASR 팩토리 + 구현체 | Whisper, Faster-Whisper, Google ASR | 필수 |
| F2.2 | LLM 팩토리 + 구현체 | OpenAI, Claude, Gemini, Ollama | 필수 |
| F2.3 | TTS 팩토리 + 구현체 | Edge TTS, MeloTTS, GPTSoVITS | 필수 |
| F2.4 | ASR→LLM→TTS 파이프라인 | 스트리밍 처리 | 필수 |
| F2.5 | WebSocket 핸들러 | /client-ws 프로토콜 구현 | 필수 |
| F2.6 | DB 설정 로딩 | YAML 대신 DB에서 설정 로드 | 필수 |
| F2.7 | Instance Manager | 프로세스 기반 인스턴스 스폰/관리 | 필수 |
| F2.8 | 인스턴스 시작/중지 API | REST 엔드포인트 | 필수 |
| F2.9 | 감정 분석 | 응답 텍스트 기반 감정 태그 생성 | 필수 |
| F2.10 | 립싱크 데이터 생성 | TTS 오디오 기반 mouth value 계산 | 필수 |
| F2.11 | 음성 중단 (Interrupt) | 사용자 발화 시 TTS 재생 중단 | 필수 |
| F2.12 | 대화 이력 저장 | conversation_logs 테이블 | 필수 |
| F2.13 | 인스턴스 헬스체크 | 30초 주기, 자동 재시작 (최대 3회) | 권장 |

### Phase 3: Frontend

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|----------|
| F3.1 | 로그인/회원가입 페이지 | 이메일 + Google OAuth | 필수 |
| F3.2 | 대시보드 | 캐릭터 목록, 인스턴스 상태 | 필수 |
| F3.3 | 캐릭터 설정 페이지 | 이름, 페르소나, Live2D 모델, 감정 매핑 | 필수 |
| F3.4 | LLM 설정 페이지 | 제공자/모델 선택, API 키 입력 | 필수 |
| F3.5 | TTS 설정 페이지 | 엔진 선택, 음성 모델 업로드 | 필수 |
| F3.6 | ASR 설정 페이지 | 엔진/언어 선택 | 필수 |
| F3.7 | VTuber 페이지 | Live2D 뷰어 + 채팅 패널 + 음성 입력 | 필수 |
| F3.8 | Live2D 렌더링 | Cubism 5.0 SDK, 감정 표현, 립싱크 | 필수 |
| F3.9 | 음성 입력 UI | 마이크 권한 요청, 녹음, VAD | 필수 |
| F3.10 | 파일 업로드 | 드래그앤드롭, 진행률 표시 | 필수 |
| F3.11 | 마우스 트래킹 | Live2D 모델 시선 추적 | 권장 |

### Phase 4: Orchestration

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|----------|
| F4.1 | GoClaw/OpenClaw 연동 | 에이전트 오케스트레이션 클라이언트 | 필수 |
| F4.2 | MCP 리버스 터널 | 서버→사용자 로컬 PC 접근 | 필수 |
| F4.3 | GPT OAuth Provider | 외부 GPT에서 AivaLink API 호출 | 권장 |
| F4.4 | 에이전트 도구 UI | 도구 실행 결과 표시 | 필수 |
| F4.5 | MCP 클라이언트 설치 가이드 | 로컬 PC 설치/설정 문서 | 필수 |

---

## 2. 기능 상세 명세

### 2.1 인증 (Authentication)

#### F1.1 이메일 회원가입

**설명**: 이메일과 비밀번호로 새 계정을 생성한다.

**요청**:
```
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecureP@ss123",
  "display_name": "홍길동"
}
```

**응답 (201 Created)**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "display_name": "홍길동",
  "created_at": "2025-01-15T09:00:00Z"
}
```

**검증 규칙**:
| 필드 | 규칙 |
|------|------|
| email | 유효한 이메일 형식, 중복 불가 |
| password | 최소 8자, 대소문자 + 숫자 + 특수문자 1개 이상 |
| display_name | 1~100자 |

**에러 케이스**:
| 상황 | 응답 코드 | 에러 코드 |
|------|-----------|-----------|
| 이메일 중복 | 409 Conflict | EMAIL_ALREADY_EXISTS |
| 비밀번호 규칙 미충족 | 422 Unprocessable Entity | INVALID_PASSWORD |
| 이메일 형식 오류 | 422 Unprocessable Entity | INVALID_EMAIL |

---

#### F1.2 이메일 로그인

**설명**: 이메일과 비밀번호로 로그인하여 JWT 토큰 쌍을 발급받는다.

**요청**:
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecureP@ss123"
}
```

**응답 (200 OK)**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 900
}
```

**에러 케이스**:
| 상황 | 응답 코드 | 에러 코드 |
|------|-----------|-----------|
| 이메일 미존재 | 401 Unauthorized | INVALID_CREDENTIALS |
| 비밀번호 불일치 | 401 Unauthorized | INVALID_CREDENTIALS |
| 비활성 계정 | 403 Forbidden | ACCOUNT_DISABLED |

---

#### F1.3 Google OAuth 로그인

**설명**: Google OAuth 2.0 Authorization Code Flow를 통해 로그인하거나 계정을 생성한다.

**흐름**:
1. 프론트엔드에서 `GET /api/auth/google` 호출
2. 서버가 Google 인증 페이지 URL을 반환 (또는 리다이렉트)
3. 사용자가 Google에서 권한 승인
4. Google이 `GET /api/auth/google/callback?code=xxx&state=yyy`로 콜백
5. 서버가 authorization code로 Google에서 토큰 교환
6. Google 사용자 정보(email, name, picture)로 사용자 조회 또는 생성
7. JWT 토큰 쌍 발급 후 프론트엔드로 리다이렉트

**요청 (1단계)**:
```
GET /api/auth/google
```

**응답 (302 Redirect)**:
```
Location: https://accounts.google.com/o/oauth2/v2/auth?
  client_id=xxx&
  redirect_uri=https://aivalink.com/api/auth/google/callback&
  response_type=code&
  scope=openid+email+profile&
  state=random_state_token
```

**콜백 응답 (리다이렉트)**:
```
Location: https://aivalink.com/auth/callback?
  access_token=eyJ...&
  refresh_token=eyJ...
```

**동작 규칙**:
- Google 이메일과 동일한 로컬 계정이 이미 있으면 연결(merge)한다.
- 처음 로그인하는 Google 사용자는 자동으로 계정을 생성한다.
- `display_name`은 Google 프로필의 이름을 사용한다.
- `avatar_url`은 Google 프로필 사진을 사용한다.

---

#### F1.4 JWT 갱신

**설명**: 만료된 Access Token을 Refresh Token으로 재발급한다.

**요청**:
```
POST /api/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**응답 (200 OK)**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...(new)",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...(new, rotated)",
  "token_type": "bearer",
  "expires_in": 900
}
```

**동작 규칙**:
- Refresh Token은 사용 시 새로운 Refresh Token으로 교체된다 (Rotation).
- 이전 Refresh Token은 즉시 폐기된다.
- 이미 폐기된 Refresh Token이 사용되면, 해당 사용자의 모든 Refresh Token을 폐기한다 (토큰 탈취 감지).

**에러 케이스**:
| 상황 | 응답 코드 | 에러 코드 |
|------|-----------|-----------|
| Refresh Token 만료 | 401 Unauthorized | TOKEN_EXPIRED |
| Refresh Token 폐기됨 | 401 Unauthorized | TOKEN_REVOKED |
| Refresh Token 형식 오류 | 401 Unauthorized | INVALID_TOKEN |

---

#### F1.5 로그아웃

**설명**: 현재 Refresh Token을 폐기한다.

**요청**:
```
POST /api/auth/logout
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**응답 (204 No Content)**: 본문 없음

---

### 2.2 캐릭터 관리

#### F1.7 캐릭터 CRUD

**캐릭터 생성 요청**:
```
POST /api/characters
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "name": "아이바",
  "persona_prompt": "당신은 밝고 활발한 AI VTuber '아이바'입니다. 한국어로 대화하며, 친근하고 재미있는 성격을 가지고 있습니다. 게임과 애니메이션을 좋아합니다.",
  "live2d_model_id": "haru",
  "language": "ko",
  "emotion_map": {
    "happy": {
      "motion_group": "TapBody",
      "motion_index": 0,
      "expression": "f01"
    },
    "sad": {
      "motion_group": "Idle",
      "motion_index": 1,
      "expression": "f02"
    },
    "angry": {
      "motion_group": "Idle",
      "motion_index": 2,
      "expression": "f03"
    },
    "surprised": {
      "motion_group": "Flick",
      "motion_index": 0,
      "expression": "f04"
    },
    "neutral": {
      "motion_group": "Idle",
      "motion_index": 0,
      "expression": "f00"
    }
  },
  "llm_config_id": "uuid-of-llm-config",
  "tts_config_id": "uuid-of-tts-config",
  "asr_config_id": "uuid-of-asr-config"
}
```

**응답 (201 Created)**:
```json
{
  "id": "char-uuid",
  "name": "아이바",
  "persona_prompt": "당신은 밝고 활발한 AI VTuber...",
  "live2d_model_id": "haru",
  "language": "ko",
  "emotion_map": { ... },
  "llm_config": { "id": "...", "name": "내 GPT-4", "provider": "openai" },
  "tts_config": { "id": "...", "name": "기본 Edge TTS", "engine": "edge_tts" },
  "asr_config": { "id": "...", "name": "기본 Whisper", "engine": "whisper" },
  "is_default": false,
  "created_at": "2025-01-15T09:00:00Z"
}
```

**검증 규칙**:
| 필드 | 규칙 |
|------|------|
| name | 1~100자, 사용자 내 중복 불가 |
| persona_prompt | 1~10,000자 |
| live2d_model_id | 서버에 존재하는 모델 ID |
| language | ISO 639-1 코드 (ko, en, ja 등) |
| emotion_map | 최소 "neutral" 키 필수 |
| llm_config_id | 사용자 소유의 유효한 설정 ID (선택) |
| tts_config_id | 사용자 소유의 유효한 설정 ID (선택) |
| asr_config_id | 사용자 소유의 유효한 설정 ID (선택) |

**캐릭터 목록 조회**:
```
GET /api/characters
Authorization: Bearer {access_token}
```

**응답 (200 OK)**:
```json
{
  "items": [
    {
      "id": "char-uuid-1",
      "name": "아이바",
      "live2d_model_id": "haru",
      "language": "ko",
      "is_default": true,
      "llm_config": { "id": "...", "name": "내 GPT-4", "provider": "openai" },
      "created_at": "2025-01-15T09:00:00Z"
    },
    {
      "id": "char-uuid-2",
      "name": "미카",
      "live2d_model_id": "miku",
      "language": "ja",
      "is_default": false,
      "llm_config": { "id": "...", "name": "Claude Sonnet", "provider": "claude" },
      "created_at": "2025-01-16T10:00:00Z"
    }
  ],
  "total": 2
}
```

**Live2D 모델 목록 조회**:
```
GET /api/characters/live2d-models
Authorization: Bearer {access_token}
```

**응답 (200 OK)**:
```json
{
  "models": [
    {
      "id": "haru",
      "name": "Haru",
      "thumbnail_url": "/static/live2d/haru/thumbnail.png",
      "is_builtin": true
    },
    {
      "id": "miku",
      "name": "Miku",
      "thumbnail_url": "/static/live2d/miku/thumbnail.png",
      "is_builtin": true
    },
    {
      "id": "custom-uuid",
      "name": "나의 캐릭터",
      "thumbnail_url": "/uploads/user-uuid/live2d/custom-uuid/thumbnail.png",
      "is_builtin": false
    }
  ]
}
```

---

### 2.3 LLM 설정

#### F1.8 LLM 설정 CRUD

**지원 제공자 조회**:
```
GET /api/llm-configs/providers
Authorization: Bearer {access_token}
```

**응답 (200 OK)**:
```json
{
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
      "auth_type": "api_key",
      "supports_oauth": false,
      "requires_base_url": false
    },
    {
      "id": "claude",
      "name": "Anthropic Claude",
      "models": ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
      "auth_type": "api_key",
      "supports_oauth": false,
      "requires_base_url": false
    },
    {
      "id": "gemini",
      "name": "Google Gemini",
      "models": ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
      "auth_type": "api_key",
      "supports_oauth": true,
      "requires_base_url": false
    },
    {
      "id": "ollama",
      "name": "Ollama (로컬)",
      "models": [],
      "auth_type": "none",
      "supports_oauth": false,
      "requires_base_url": true,
      "default_base_url": "http://localhost:11434"
    }
  ]
}
```

**LLM 설정 생성 (API 키 방식)**:
```
POST /api/llm-configs
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "name": "내 GPT-4o",
  "provider": "openai",
  "model_name": "gpt-4o",
  "api_key": "sk-xxxxxxxxxxxxxxxxxxxxxxxx",
  "temperature": 0.7,
  "max_tokens": 2048
}
```

**응답 (201 Created)**:
```json
{
  "id": "llm-uuid",
  "name": "내 GPT-4o",
  "provider": "openai",
  "model_name": "gpt-4o",
  "has_api_key": true,
  "oauth_connected": false,
  "temperature": 0.7,
  "max_tokens": 2048,
  "created_at": "2025-01-15T09:00:00Z"
}
```

**주의**: 응답에 `api_key` 원문은 절대 포함하지 않는다. `has_api_key: true`로만 표시한다.

**LLM 설정 생성 (OAuth 방식)**:
```
POST /api/llm-configs
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "name": "Google Gemini (OAuth)",
  "provider": "gemini",
  "model_name": "gemini-2.0-flash",
  "oauth_token_id": "oauth-token-uuid"
}
```

**LLM 설정 생성 (Ollama - 로컬)**:
```
POST /api/llm-configs
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "name": "로컬 Llama",
  "provider": "ollama",
  "model_name": "llama3.1:8b",
  "base_url": "http://localhost:11434",
  "temperature": 0.8
}
```

**검증 규칙**:
| 필드 | 규칙 |
|------|------|
| name | 1~100자, 사용자 내 중복 불가 |
| provider | 지원되는 제공자 ID |
| model_name | 해당 제공자의 유효한 모델명 |
| api_key | provider가 api_key 인증 타입일 때 필수 (oauth 미사용 시) |
| base_url | provider가 requires_base_url일 때 필수 |
| temperature | 0.0~2.0 |
| max_tokens | 1~100,000 |

---

### 2.4 TTS 설정

#### F1.9 TTS 설정 CRUD

**지원 엔진 조회**:
```
GET /api/tts-configs/engines
Authorization: Bearer {access_token}
```

**응답 (200 OK)**:
```json
{
  "engines": [
    {
      "id": "edge_tts",
      "name": "Microsoft Edge TTS",
      "supports_custom_voice": false,
      "builtin_voices": [
        {"id": "ko-KR-SunHiNeural", "name": "선희 (한국어, 여성)"},
        {"id": "ko-KR-InJoonNeural", "name": "인준 (한국어, 남성)"},
        {"id": "en-US-JennyNeural", "name": "Jenny (영어, 여성)"},
        {"id": "ja-JP-NanamiNeural", "name": "나나미 (일본어, 여성)"}
      ],
      "requires_gpu": false
    },
    {
      "id": "melo_tts",
      "name": "MeloTTS",
      "supports_custom_voice": false,
      "builtin_voices": [
        {"id": "KR", "name": "한국어 기본"},
        {"id": "EN", "name": "영어 기본"},
        {"id": "JP", "name": "일본어 기본"}
      ],
      "requires_gpu": true
    },
    {
      "id": "gptsovits",
      "name": "GPT-SoVITS",
      "supports_custom_voice": true,
      "builtin_voices": [],
      "requires_gpu": true,
      "custom_voice_info": {
        "accepted_formats": [".pth", ".onnx"],
        "max_file_size_mb": 500,
        "description": "GPT-SoVITS로 학습한 커스텀 음성 모델 파일을 업로드하세요."
      }
    }
  ]
}
```

**TTS 설정 생성 (내장 음성)**:
```
POST /api/tts-configs
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "name": "한국어 선희",
  "engine": "edge_tts",
  "voice_name": "ko-KR-SunHiNeural",
  "language": "ko",
  "speed": 1.0
}
```

**TTS 설정 생성 (커스텀 음성 모델)**:

먼저 음성 모델 파일을 업로드하고, 반환된 파일 ID를 설정에 연결한다.

```
# 1단계: 파일 업로드
POST /api/files/upload
Authorization: Bearer {access_token}
Content-Type: multipart/form-data

file: (binary data)
file_type: "voice_model"
```

```json
{
  "id": "file-uuid",
  "original_name": "my_voice_model.pth",
  "file_size": 104857600,
  "file_type": "voice_model",
  "created_at": "2025-01-15T09:00:00Z"
}
```

```
# 2단계: TTS 설정 생성
POST /api/tts-configs
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "name": "나의 커스텀 음성",
  "engine": "gptsovits",
  "voice_model_file_id": "file-uuid",
  "language": "ko",
  "speed": 1.0,
  "extra_params": {
    "ref_audio_text": "안녕하세요, 반갑습니다."
  }
}
```

---

### 2.5 ASR 설정

#### F1.10 ASR 설정 CRUD

**지원 엔진 조회**:
```
GET /api/asr-configs/engines
Authorization: Bearer {access_token}
```

**응답 (200 OK)**:
```json
{
  "engines": [
    {
      "id": "whisper",
      "name": "OpenAI Whisper",
      "model_sizes": ["tiny", "base", "small", "medium", "large-v3"],
      "supported_languages": ["ko", "en", "ja", "zh", "auto"],
      "requires_gpu": true
    },
    {
      "id": "faster_whisper",
      "name": "Faster Whisper",
      "model_sizes": ["tiny", "base", "small", "medium", "large-v3"],
      "supported_languages": ["ko", "en", "ja", "zh", "auto"],
      "requires_gpu": true,
      "description": "Whisper의 CTranslate2 최적화 버전. 동일 정확도에서 약 4배 빠름."
    },
    {
      "id": "google",
      "name": "Google Speech-to-Text",
      "model_sizes": [],
      "supported_languages": ["ko", "en", "ja", "zh"],
      "requires_gpu": false,
      "requires_api_key": true
    }
  ]
}
```

**ASR 설정 생성**:
```
POST /api/asr-configs
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "name": "기본 Whisper",
  "engine": "faster_whisper",
  "model_size": "base",
  "language": "ko"
}
```

---

### 2.6 VTuber 인스턴스 관리

#### F2.7~F2.8 인스턴스 시작/중지/상태 확인

**인스턴스 시작**:
```
POST /api/instances
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "character_id": "char-uuid"
}
```

**응답 (201 Created)**:
```json
{
  "id": "instance-uuid",
  "character_id": "char-uuid",
  "character_name": "아이바",
  "status": "starting",
  "websocket_url": "ws://aivalink.com/client-ws/instance-uuid",
  "created_at": "2025-01-15T09:00:00Z"
}
```

**사전 조건 검증**:
| 조건 | 실패 시 |
|------|---------|
| 캐릭터에 LLM 설정이 연결되어야 함 | 400: LLM_CONFIG_REQUIRED |
| 캐릭터에 TTS 설정이 연결되어야 함 | 400: TTS_CONFIG_REQUIRED |
| 캐릭터에 ASR 설정이 연결되어야 함 | 400: ASR_CONFIG_REQUIRED |
| 사용자의 동시 인스턴스 제한 미초과 | 429: INSTANCE_LIMIT_EXCEEDED |
| LLM API 키 또는 OAuth 토큰 유효 | 400: INVALID_LLM_CREDENTIALS |

**인스턴스 상태 조회**:
```
GET /api/instances/{instance_id}/status
Authorization: Bearer {access_token}
```

**응답 (200 OK)**:
```json
{
  "id": "instance-uuid",
  "status": "running",
  "character_name": "아이바",
  "uptime_seconds": 3600,
  "websocket_url": "ws://aivalink.com/client-ws/instance-uuid",
  "started_at": "2025-01-15T09:00:00Z"
}
```

**인스턴스 중지**:
```
DELETE /api/instances/{instance_id}
Authorization: Bearer {access_token}
```

**응답 (200 OK)**:
```json
{
  "id": "instance-uuid",
  "status": "stopping",
  "message": "인스턴스가 종료됩니다."
}
```

**인스턴스 상태 전이**:
```
pending → starting → running → stopping → stopped
                       ↓
                     error
```

---

### 2.7 실시간 대화

#### F2.4~F2.5 WebSocket 기반 실시간 대화

**연결**:
```
WebSocket: ws://{host}/client-ws/{instance_id}?token={jwt_access_token}
```

**연결 성공 시 서버 응답**:
```json
{
  "type": "connected",
  "data": {
    "instance_id": "instance-uuid",
    "character": {
      "name": "아이바",
      "live2d_model": "haru",
      "emotion_map": {
        "happy": {"motion_group": "TapBody", "motion_index": 0, "expression": "f01"},
        "neutral": {"motion_group": "Idle", "motion_index": 0, "expression": "f00"}
      }
    }
  }
}
```

#### 텍스트 입력 대화 흐름

```
Client                          Server
  |                               |
  |  {"type":"text-input",        |
  |   "data":{"text":"안녕!"}}    |
  | ----------------------------> |
  |                               |  [LLM 처리 시작]
  |                               |
  |  {"type":"text-chunk",        |
  |   "data":{"text":"안녕","is_final":false}} |
  | <---------------------------- |
  |                               |
  |  {"type":"text-chunk",        |
  |   "data":{"text":"하세요!","is_final":false}} |
  | <---------------------------- |
  |                               |
  |  {"type":"text-complete",     |
  |   "data":{"full_text":"안녕하세요! 기분이 어떠세요?"}} |
  | <---------------------------- |
  |                               |  [감정 분석]
  |  {"type":"emotion",           |
  |   "data":{"emotion":"happy","expression":"f01"}} |
  | <---------------------------- |
  |                               |  [TTS 처리]
  |  {"type":"audio-chunk",       |
  |   "data":{"audio":"base64...","is_final":false}} |
  | <---------------------------- |
  |                               |
  |  {"type":"audio-chunk",       |
  |   "data":{"audio":"base64...","is_final":true}} |
  | <---------------------------- |
  |                               |
```

#### 음성 입력 대화 흐름

```
Client                          Server
  |                               |
  |  {"type":"audio-input",       |
  |   "data":{                    |
  |     "audio":"base64...(PCM)", |
  |     "sample_rate":16000,      |
  |     "channels":1              |
  |   }}                          |
  | ----------------------------> |
  |                               |  [ASR 처리]
  |  {"type":"user-transcript",   |
  |   "data":{"text":"안녕!","is_final":true}} |
  | <---------------------------- |
  |                               |
  |  (이후 텍스트 입력과 동일한 흐름) |
  |                               |
```

#### 음성 중단 (Interrupt)

사용자가 VTuber 발화 중 마이크 입력을 시작하면, 현재 재생 중인 TTS 오디오를 중단한다.

```
Client                          Server
  |                               |
  |  (서버가 audio-chunk 전송 중)  |
  |                               |
  |  {"type":"interrupt",         |
  |   "data":{}}                  |
  | ----------------------------> |
  |                               |  [TTS 중단, LLM 중단]
  |  {"type":"interrupted",       |
  |   "data":{"stopped_at":"기분이"}} |
  | <---------------------------- |
  |                               |
  |  (사용자의 새 음성 입력 처리)   |
  |                               |
```

---

### 2.8 Live2D 제어

#### F2.9 감정 표현

감정 분석은 LLM 응답 텍스트를 기반으로 서버에서 수행하며, 결과 태그를 프론트엔드에 전송한다.

**감정 키워드 매핑 (기본 전략)**:
```json
{
  "happy": ["기쁘", "좋아", "행복", "즐거", "웃", "하하", "ㅎㅎ", "재미"],
  "sad": ["슬프", "우울", "안타깝", "힘들", "눈물", "ㅠㅠ"],
  "angry": ["화나", "짜증", "분노", "싫어", "열받"],
  "surprised": ["놀라", "대박", "헐", "진짜?", "와!", "세상에"],
  "neutral": []
}
```

**감정 결정 로직**:
1. 응답 텍스트에서 감정 키워드를 검색한다.
2. 매칭된 키워드가 가장 많은 감정을 선택한다.
3. 키워드가 없으면 "neutral"을 반환한다.
4. (선택) LLM 기반 감정 분석: 별도 프롬프트로 감정을 분류한다.

#### F2.10 립싱크

TTS 오디오의 볼륨 레벨을 분석하여 mouth_open 값을 생성한다.

**립싱크 데이터 생성**:
- 오디오 프레임별 RMS(Root Mean Square) 값을 계산한다.
- RMS 값을 0.0~1.0 범위로 정규화하여 `mouth_open` 값으로 사용한다.
- 무음 구간은 `mouth_open: 0.0`이다.

**프론트엔드 적용**:
- `audio-chunk`와 함께 전송되는 `lipsync` 데이터를 Live2D 모델의 ParamMouthOpenY 파라미터에 적용한다.

#### F3.11 마우스 트래킹

프론트엔드에서 마우스 위치를 서버에 전송하고, Live2D 모델의 시선이 마우스를 따라가게 한다.

**클라이언트 → 서버**:
```json
{
  "type": "mouse-position",
  "data": {
    "x": 0.5,
    "y": 0.3
  }
}
```

**프론트엔드 처리**:
- 마우스 좌표를 Live2D 모델의 ParamAngleX, ParamAngleY, ParamEyeBallX, ParamEyeBallY 파라미터에 매핑한다.
- 서버 전송 없이 프론트엔드에서 직접 처리하는 방식도 가능하다 (권장).

---

### 2.9 에이전트 도구

#### F4.1~F4.2 GoClaw/OpenClaw + MCP

**에이전트 도구 실행 흐름**:

LLM이 tool_call을 반환하면, 에이전트 오케스트레이터가 해당 도구를 실행한다.

**서버 → 클라이언트 (도구 실행 중)**:
```json
{
  "type": "agent-tool-calling",
  "data": {
    "tool_name": "read_file",
    "description": "파일을 읽고 있습니다...",
    "parameters": {
      "path": "/Users/user/document.txt"
    }
  }
}
```

**서버 → 클라이언트 (도구 실행 완료)**:
```json
{
  "type": "agent-tool-result",
  "data": {
    "tool_name": "read_file",
    "success": true,
    "result": "파일 내용: Lorem ipsum dolor sit amet...",
    "duration_ms": 1200
  }
}
```

**MCP 도구 카탈로그 (예시)**:
| 도구명 | 설명 | MCP 경유 |
|--------|------|----------|
| read_file | 로컬 PC 파일 읽기 | 예 |
| write_file | 로컬 PC 파일 쓰기 | 예 |
| list_directory | 로컬 디렉토리 목록 | 예 |
| web_search | 웹 검색 | 아니오 (서버 직접) |
| get_weather | 날씨 조회 | 아니오 (서버 직접) |
| run_command | 로컬 명령어 실행 | 예 |
| clipboard_read | 클립보드 내용 읽기 | 예 |
| open_application | 로컬 앱 실행 | 예 |

**MCP 연결 상태 확인**:
```
GET /api/agents/mcp-status
Authorization: Bearer {access_token}
```

**응답**:
```json
{
  "connected": true,
  "client_version": "1.0.0",
  "available_tools": ["read_file", "write_file", "list_directory", "run_command"],
  "connected_at": "2025-01-15T09:00:00Z"
}
```

---

### 2.10 파일 업로드

#### F3.10 파일 업로드 관리

**업로드 요청**:
```
POST /api/files/upload
Authorization: Bearer {access_token}
Content-Type: multipart/form-data

file: (binary data)
file_type: "voice_model" | "live2d_model" | "avatar"
```

**응답 (201 Created)**:
```json
{
  "id": "file-uuid",
  "original_name": "my_voice.pth",
  "file_type": "voice_model",
  "file_size": 104857600,
  "mime_type": "application/octet-stream",
  "created_at": "2025-01-15T09:00:00Z"
}
```

**파일 유형별 제한**:
| 파일 유형 | 최대 크기 | 허용 확장자 |
|-----------|-----------|-------------|
| voice_model | 500MB | .pth, .onnx, .bin |
| live2d_model | 100MB | .zip |
| avatar | 5MB | .png, .jpg, .jpeg, .webp |

**업로드된 파일 목록 조회**:
```
GET /api/files?file_type=voice_model
Authorization: Bearer {access_token}
```

**파일 삭제**:
```
DELETE /api/files/{file_id}
Authorization: Bearer {access_token}
```

**삭제 사전 조건**: 해당 파일을 참조하는 TTS 설정이 없어야 한다. 참조 중이면 400 에러를 반환한다.

---

## 3. API 엔드포인트 전체 목록

### 3.1 인증

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| POST | /api/auth/register | 회원가입 | 불필요 |
| POST | /api/auth/login | 로그인 | 불필요 |
| POST | /api/auth/refresh | 토큰 갱신 | 불필요 |
| POST | /api/auth/logout | 로그아웃 | 필요 |
| GET | /api/auth/google | Google OAuth 시작 | 불필요 |
| GET | /api/auth/google/callback | Google OAuth 콜백 | 불필요 |

### 3.2 사용자

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| GET | /api/users/me | 내 정보 조회 | 필요 |
| PUT | /api/users/me | 내 정보 수정 | 필요 |
| DELETE | /api/users/me | 계정 삭제 | 필요 |

### 3.3 캐릭터

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| GET | /api/characters | 캐릭터 목록 | 필요 |
| POST | /api/characters | 캐릭터 생성 | 필요 |
| GET | /api/characters/{id} | 캐릭터 상세 | 필요 |
| PUT | /api/characters/{id} | 캐릭터 수정 | 필요 |
| DELETE | /api/characters/{id} | 캐릭터 삭제 | 필요 |
| GET | /api/characters/live2d-models | Live2D 모델 목록 | 필요 |

### 3.4 LLM 설정

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| GET | /api/llm-configs | LLM 설정 목록 | 필요 |
| POST | /api/llm-configs | LLM 설정 생성 | 필요 |
| GET | /api/llm-configs/{id} | LLM 설정 상세 | 필요 |
| PUT | /api/llm-configs/{id} | LLM 설정 수정 | 필요 |
| DELETE | /api/llm-configs/{id} | LLM 설정 삭제 | 필요 |
| GET | /api/llm-configs/providers | 지원 제공자 목록 | 필요 |

### 3.5 TTS 설정

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| GET | /api/tts-configs | TTS 설정 목록 | 필요 |
| POST | /api/tts-configs | TTS 설정 생성 | 필요 |
| GET | /api/tts-configs/{id} | TTS 설정 상세 | 필요 |
| PUT | /api/tts-configs/{id} | TTS 설정 수정 | 필요 |
| DELETE | /api/tts-configs/{id} | TTS 설정 삭제 | 필요 |
| GET | /api/tts-configs/engines | 지원 엔진 목록 | 필요 |

### 3.6 ASR 설정

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| GET | /api/asr-configs | ASR 설정 목록 | 필요 |
| POST | /api/asr-configs | ASR 설정 생성 | 필요 |
| GET | /api/asr-configs/{id} | ASR 설정 상세 | 필요 |
| PUT | /api/asr-configs/{id} | ASR 설정 수정 | 필요 |
| DELETE | /api/asr-configs/{id} | ASR 설정 삭제 | 필요 |
| GET | /api/asr-configs/engines | 지원 엔진 목록 | 필요 |

### 3.7 인스턴스

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| GET | /api/instances | 내 인스턴스 목록 | 필요 |
| POST | /api/instances | 인스턴스 시작 | 필요 |
| GET | /api/instances/{id}/status | 인스턴스 상태 | 필요 |
| DELETE | /api/instances/{id} | 인스턴스 중지 | 필요 |

### 3.8 파일

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| GET | /api/files | 업로드 파일 목록 | 필요 |
| POST | /api/files/upload | 파일 업로드 | 필요 |
| GET | /api/files/{id} | 파일 정보 조회 | 필요 |
| DELETE | /api/files/{id} | 파일 삭제 | 필요 |

### 3.9 에이전트

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| GET | /api/agents/mcp-status | MCP 연결 상태 | 필요 |
| GET | /api/agents/tools | 사용 가능한 도구 목록 | 필요 |

### 3.10 WebSocket

| Protocol | Path | 설명 | 인증 |
|----------|------|------|------|
| WebSocket | /client-ws/{instance_id} | 실시간 대화 | query param (token) |

---

## 4. WebSocket 메시지 프로토콜 상세

### 4.1 메시지 포맷

모든 WebSocket 메시지는 JSON 형식이며, 다음 구조를 따른다:

```json
{
  "type": "메시지_타입",
  "data": { ... }
}
```

### 4.2 Client → Server 메시지

| type | 설명 | data 필드 |
|------|------|-----------|
| `text-input` | 텍스트 메시지 입력 | `text: string` |
| `audio-input` | 음성 데이터 전송 | `audio: string (base64)`, `sample_rate: number`, `channels: number` |
| `interrupt` | 현재 TTS 재생 중단 | (없음) |
| `mouse-position` | 마우스 위치 (Live2D 트래킹) | `x: number (0~1)`, `y: number (0~1)` |
| `ping` | 연결 유지 확인 | (없음) |

### 4.3 Server → Client 메시지

| type | 설명 | data 필드 |
|------|------|-----------|
| `connected` | 연결 성공 | `instance_id`, `character: {name, live2d_model, emotion_map}` |
| `user-transcript` | ASR 인식 결과 | `text: string`, `is_final: boolean` |
| `text-chunk` | LLM 응답 chunk | `text: string`, `is_final: boolean` |
| `text-complete` | LLM 응답 완료 | `full_text: string` |
| `audio-chunk` | TTS 오디오 chunk | `audio: string (base64)`, `sample_rate: number`, `is_final: boolean` |
| `emotion` | 감정 변경 | `emotion: string`, `motion_group: string`, `motion_index: number`, `expression: string` |
| `lipsync` | 립싱크 데이터 | `mouth_open: number (0~1)` |
| `interrupted` | 중단 확인 | `stopped_at: string` |
| `agent-tool-calling` | 에이전트 도구 실행 중 | `tool_name: string`, `description: string`, `parameters: object` |
| `agent-tool-result` | 에이전트 도구 결과 | `tool_name: string`, `success: boolean`, `result: string`, `duration_ms: number` |
| `error` | 에러 | `code: string`, `message: string` |
| `pong` | ping 응답 | (없음) |

### 4.4 에러 코드

| 코드 | 설명 | 대응 |
|------|------|------|
| `AUTH_FAILED` | JWT 인증 실패 | 재로그인 필요 |
| `INSTANCE_NOT_FOUND` | 인스턴스 없음 | 인스턴스 재시작 |
| `INSTANCE_NOT_RUNNING` | 인스턴스 미실행 | 인스턴스 시작 후 재연결 |
| `ASR_FAILED` | 음성 인식 실패 | 다시 시도 안내 |
| `LLM_FAILED` | LLM 응답 실패 | API 키 확인 안내 |
| `LLM_RATE_LIMITED` | LLM 제공자 Rate Limit | 잠시 후 재시도 |
| `TTS_FAILED` | TTS 변환 실패 | TTS 설정 확인 |
| `AGENT_TOOL_FAILED` | 에이전트 도구 실행 실패 | MCP 연결 확인 |
| `MCP_DISCONNECTED` | MCP 클라이언트 연결 끊김 | MCP 클라이언트 재시작 |
| `INVALID_MESSAGE` | 잘못된 메시지 형식 | 클라이언트 프로토콜 확인 |

---

## 5. 공통 에러 응답 형식

모든 REST API 에러 응답은 다음 형식을 따른다:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "사용자에게 표시할 메시지",
    "details": { ... }
  }
}
```

**HTTP 상태 코드 활용**:
| 상태 코드 | 의미 | 사용 케이스 |
|-----------|------|-------------|
| 400 | Bad Request | 입력 검증 실패, 사전 조건 미충족 |
| 401 | Unauthorized | 인증 실패, 토큰 만료 |
| 403 | Forbidden | 권한 없음, 비활성 계정 |
| 404 | Not Found | 리소스 없음 |
| 409 | Conflict | 중복 (이메일, 이름 등) |
| 422 | Unprocessable Entity | 입력 형식 오류 |
| 429 | Too Many Requests | Rate Limit, 인스턴스 제한 초과 |
| 500 | Internal Server Error | 서버 내부 오류 |
