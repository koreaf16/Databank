# 홈/채널 현행화 + 범용 트렌드 + AI 연결 — 아키텍처

## 개요

이 문서는 DataBank Slack의 다음 세 가지 작업을 하나의 그림으로 묶는다.

1. **홈·채널 화면 현행화** — `window.*` 전역 mock을 걷어내고 모든 화면을 실제 Oracle DB로 전환
2. **트렌드 일반화** — Oracle 전용 capacity kind 구조를 모든 시스템(WAS, MySQL, Redis, OS, 클라우드, 보안장비)이 공유하는 범용 시계열 메트릭 시스템으로 확장
3. **AI 연결** — 기존 KB(지식베이스) RAG 인프라를 재사용해 AIPanel · 메시지 작업 자동 추출 · 트렌드 이상치 인사이트 3종을 채널 흐름에 부착

**UI 디자인은 변경하지 않는다. 데이터 소스만 교체한다.**

작업 시작 전 [04-critical-review.md](04-critical-review.md) 의 "구현 전 체크리스트"를 먼저 통과시킨 뒤 본 문서의 단계별 작업으로 진입한다.

---

## 한 페이지 그림

```
┌────────────────────────────────────────────────────────────────────┐
│                         React 18 + Vite (포트 7000)                │
│                                                                    │
│   ┌──────────┐   ┌────────────┐   ┌──────────┐   ┌─────────────┐   │
│   │  홈      │   │  채널 셸   │   │  트렌드  │   │  AI 패널    │   │
│   │ HomeInbox│   │ Workspace  │   │  화면    │   │  AIPanel    │   │
│   └────┬─────┘   └─────┬──────┘   └────┬─────┘   └──────┬──────┘   │
│        │               │               │                │          │
│   ┌────▼───────────────▼───────────────▼────────────────▼──────┐   │
│   │ UserContext / MasterDataContext  ← /api/auth/me, masters   │   │
│   │ messagingApi / homeApi / metricsApi / channelAssistantApi  │   │
│   │ shared/api/sseClient.ts (POST + ReadableStream)            │   │
│   └────────────────────────────┬───────────────────────────────┘   │
└────────────────────────────────┼───────────────────────────────────┘
                                 │  HTTP (포트 7001)
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                  Express 4 (모듈러 모놀리스)                       │
│                                                                    │
│  ┌─────────┐  ┌───────────┐  ┌───────────┐  ┌────────────────┐     │
│  │ auth    │  │ messaging │  │ metrics   │  │ knowledge-base │     │
│  │ /me     │  │  + AI 보조│  │ (신규)    │  │ (재사용)       │     │
│  └────┬────┘  └─────┬─────┘  └─────┬─────┘  └────────┬───────┘     │
│       │             │              │                  │            │
│       │             ├──> channelAssistant.ts          │            │
│       │             ├──> taskExtractor.ts             │            │
│       │             │                                 │            │
│       │             │     ┌─────────────────┐         │            │
│       │             └────>│  llmRouter.ts   │<────────┤            │
│       │                   │ aiModelResolver │         │            │
│       │                   │ (+useCase 보강) │         │            │
│       │                   │ promptBuilder   │         │            │
│       │                   │ hybridSearch    │         │            │
│       │                   └────────┬────────┘         │            │
│       │                            │                  │            │
│       │              metrics/services/trendInsight.ts │            │
│       │                            │                  │            │
│  ┌────▼────────────────────────────▼──────────────────▼────────┐   │
│  │                    infra/oracle  (raw SQL)                  │   │
│  │             withConnection / withTransaction                │   │
│  └────────────────────────────┬────────────────────────────────┘   │
└────────────────────────────────┼───────────────────────────────────┘
                                 ▼
              ┌──────────────────────────────────┐
              │  Oracle 26ai (정형 + VECTOR)     │
              │                                  │
              │  USERS, DEPARTMENTS, CUSTOMERS,  │
              │  CHANNELS, MESSAGES,             │
              │  SUPPORT_HISTORIES,              │
              │  WEEKLY_REPORTS,                 │
              │  KB_DOCUMENTS, KB_CHUNKS,        │
              │                                  │
              │  ▼ 신규 (Stage 2)                │
              │  METRIC_DEFINITIONS              │
              │  MONITOR_TARGETS                 │
              │  METRIC_SAMPLES (월 파티션)      │
              │  TARGET_METRIC_OVERRIDES         │
              │                                  │
              │  AI_MODELS (USE_CASES 활용)      │
              └──────────────────────────────────┘
                          ▲
                          │  POST /api/metrics/ingest
                          │
              ┌───────────┴───────────────────┐
              │  외부 수집 Agent (선택)       │
              │  Oracle/MySQL/Redis/OS/AWS    │
              │  → 메트릭 push (5분 간격)     │
              └───────────────────────────────┘
```

`TEAMS` 테이블은 별도로 두지 않는다. 팀 채널 · 주간보고의 팀 식별자는 `DEPARTMENTS.DEPT_ID` 를 그대로 쓴다.

---

## 데이터 흐름

### 흐름 A — 홈·채널 화면 부팅 (Stage 1)

```
1. 브라우저 로드
2. app.tsx → GET /api/auth/me                    → UserContext 주입
                (이미 존재. 응답 필드 정규화만)
3. app.tsx → GET /api/org/departments,           → MasterDataContext 주입
            /api/customers, /api/service-master    (모두 기존 라우트)
4. HomeInbox → GET /api/channels?kind=team|customer|dm  (병렬, 기존 API)
5. 사용자가 채널 선택
6. Workspace      → GET /api/channels/:id/messages
   ChannelHistory → GET /api/support-history?customerId=
   ChannelReports → GET /api/weekly-reports?weekStart=&teamId=
                   (필요 시 고객사 채널용 조인 endpoint 추가)
   ChannelTrend   → GET /api/metrics/risk?customerId= (Stage 2 이후)
```

`window.*` 어디에도 의존하지 않는다. 브라우저 표준 `window.location` · `window.confirm` · `localStorage` 같은 플랫폼 API는 그대로 사용한다.

### 흐름 B — 메트릭 수집 (Stage 2)

```
방식 1: 정기점검 보고서 파싱
  엔지니어가 보고서 작성 → AI 파싱(SSH 로그/스크린샷) →
  capacity 항목 추출 → POST /api/metrics/manual → METRIC_SAMPLES insert

방식 2: Agent push (인증 토큰)
  Agent가 시스템에서 메트릭 수집 (5분 간격) →
  POST /api/metrics/ingest (배치) →
  withTransaction:
    - 메트릭 정의의 warn/crit + override(있으면) 비교 → status 결정
    - METRIC_SAMPLES insert
    - 배치 단위로 audit 1건

방식 3: UI 수동 입력
  관리자가 정기점검 화면에서 직접 입력 →
  POST /api/metrics/manual → 즉시 트렌드 화면 반영
```

조회는 항상 `GET /api/metrics/samples?targetId=&metricId=&from=&to=&agg=raw|hour|day|month`. 12개월 이상 된 데이터의 월별 집계 이관은 Stage 2-2 선택 산출물이다.

### 흐름 C — AI 호출 (Stage 3)

```
공통 진입: resolveLlmModelForUseCase(connection, useCase)
   useCase: channel_assistant | task_extractor | trend_insight
   1. AI_MODELS 에서 MODEL_TYPE='llm', STATUS='active'
   2. USE_CASES CSV에 useCase 포함된 모델 우선
   3. 없으면 IS_DEFAULT=1 fallback
   → 결과 모델로 streamChatWithModel() 또는 chatOnceWithModel()

C-1. AIPanel 질문
   AIPanel → POST /api/channels/:id/assistant/ask (POST + ReadableStream) →
   channelAssistant.ts:
     1) 최근 50건 메시지 + 최근 5건 이력 (raw SQL)
     2) hybridSearch(conn, question, 3, undefined, 'hybrid') → KB 청크 3건
     3) buildChannelAssistantMessages 로 컨텍스트 조립
     4) streamChatWithModel(model, messages, onToken) 토큰 스트리밍
     5) [1][2] 인용 → 메시지 ID/이력 ID/KB 청크 ID 통합 레지스트리

C-2. 메시지 → 작업 추출
   호버 "작업카드 변환" → POST /api/channels/:channelId/messages/:messageId/extract-task →
   taskExtractor.ts:
     1) 메시지 본문 + 채널 customer_id 컨텍스트
     2) chatOnceWithModel(model, messages, { responseFormat: 'json' })
        - OpenAI: response_format json_object
        - Ollama/Anthropic: 시스템 프롬프트로 JSON 강제 + 파싱 실패 재시도
     3) 결과 반환 (저장 X) → 엔지니어 인라인 편집
   확정: POST /confirm → support-history insert + audit

C-3. 트렌드 이상치 인사이트
   ChannelTrend → GET /api/metrics/insights?customerId= →
   trendInsight.ts:
     1) METRIC_SAMPLES 최근 12개월 통계 (서버단, LLM 안 씀)
     2) 임계값 초과/근접 + 선형회귀 N개월 예측
     3) hybridSearch(conn, "MySQL 메모리 사용률 급증", 2, undefined, 'hybrid')
     4) chatOnceWithModel('trend_insight') → 자연어 요약 + 권장 액션
     5) 1시간 캐싱 (collected_at hash 키)
```

---

## 모듈 의존성

| 모듈 | 의존하는 모듈 | 이유 |
|---|---|---|
| home (기존) | messaging, support-history, calendar, metrics | 홈 KPI/위젯 집계 |
| messaging (확장) | organization, customers, knowledge-base, **신규 channelAssistant** | 채널, 멘션, AI 질의 |
| messaging.taskExtractor (신규) | knowledge-base/services/generator, support-history | LLM 호출 + 작업 등록 |
| metrics (신규) | organization (departments), customers, settings/service-masters | 모니터링 대상이 부서·고객사·서비스에 묶임 |
| metrics.trendInsight (신규) | knowledge-base/services, ai-models | LLM 호출 + KB 검색 |
| AIPanel (확장) | messaging.channelAssistant, shared/api/sseClient | 채널 컨텍스트 Q&A |
| 모든 신규 모듈 | infra/oracle, http/rbac, audit | 공용 |

순환 의존 없음. AI 관련 service는 모두 knowledge-base의 generator/retriever를 단방향 import.

---

## AI 통합 지점

| 진입점 | useCase | 호출 함수 | 출력 |
|---|---|---|---|
| AIPanel 질문 입력 | `channel_assistant` | `streamChatWithModel` | POST + ReadableStream 토큰 + 인용 |
| AIPanel "이번 주 보고서 초안" | `channel_assistant` | `streamChatWithModel` | 토큰 |
| 메시지 호버 "작업카드 변환" | `task_extractor` | `chatOnceWithModel` (JSON) | 구조화 객체 |
| 트렌드 화면 인사이트 카드 | `trend_insight` | `chatOnceWithModel` | 자연어 + 액션 목록 |

AI_MODELS 테이블의 `USE_CASES` CSV 컬럼을 활용한다. 별도 `AI_USE_CASES` 카탈로그 테이블 도입은 라벨 관리가 필요해질 때의 후속 선택지로 둔다.

**선행 보강 (Stage 3 첫 작업)**:

- `resolveLlmModelForUseCase(conn, useCase)` — 현재 `resolveModel(conn, modelType)` 은 `'embedding'|'reranker'|'llm'` 만 받는다. useCase 분기 wrapper 신규
- `chatOnceWithModel(model, messages, opts)` / `streamChatWithModel(model, messages, onToken)` — 현재 `chatOnce(conn, msgs)` / `streamChat(conn, msgs, onToken)` 는 모델을 직접 주입하지 못한다. 모델 인자형 wrapper 신규
- `frontend/src/shared/api/sseClient.ts` — 브라우저 `EventSource` 는 GET-only다. 현재 KB는 `kbSearchApi.askStream` 에서 `fetch + ReadableStream` 으로 처리한다. 그 패턴을 공용 helper로 끌어올린다

**실패 처리 원칙**: silent failure 금지. AIPanel은 명시적 에러 토스트, 작업 추출은 빈 폼 fallback, 트렌드 인사이트는 카드를 숨기되 작은 "AI 분석 일시 불가" 텍스트 노출.

---

## 메트릭 수집 경로

```
+---------------------+         +-------------------+
| 정기점검 보고서      │  AI파싱 │ POST /metrics/    │
| (SSH 로그, 스크린샷) │────────▶│ manual            │──┐
+---------------------+         +-------------------+  │
                                                       │
+---------------------+         +-------------------+  │
| 외부 시스템 (DB,    │  Agent  │ POST /metrics/    │  │
| OS, AWS, 보안장비)  │  push   │ ingest (batch)    │──┤
+---------------------+         +-------------------+  │
                                                       ▼
                                +-------------------------------+
                                │ withTransaction:              │
                                │   1) 임계값 비교              │
                                │      (override 우선, 없으면   │
                                │       definition 기본값)      │
                                │   2) status 결정 (ok/warn/crit)│
                                │   3) METRIC_SAMPLES insert    │
                                │   4) audit 1건/배치           │
                                +---------------+---------------+
                                                │
                                                ▼
                                +-------------------------------+
                                │ METRIC_SAMPLES                │
                                │ (RANGE INTERVAL 월 파티션)    │
                                │  - 최근 12개월 raw            │
                                │  - 12개월 이상 → 월별 집계    │
                                │    (METRIC_AGGREGATES,        │
                                │     Stage 2-2 선택 산출물)    │
                                +-------------------------------+
```

조회 경로:
```
ChannelTrend → GET /metrics/risk     → 위험 Top N (single round-trip)
            → GET /metrics/samples   → 시계열 라인차트
            → GET /metrics/insights  → AI 자연어 요약
```

---

## UI 디자인 불변 원칙

이 작업의 핵심 제약: **레이아웃 · 색 · 간격 · 폰트 · 아이콘 어느 것도 바꾸지 않는다.** 다음만 허용된다.

- 데이터 prop 형태 변경 (예: `services` → `observations[]`)
- 동일 디자인 안에서 데이터 소스 교체 (`window.X` → API 응답)
- 동일 카드 내 신규 필터 추가 (예: 시스템 종류 탭) — 단, 기존 탭 스타일 그대로
- 신규 카드 추가 시 `card card-pad` 등 기존 클래스 그대로 사용

500줄 한도 때문에 `ChannelTrend.tsx`(현 476줄)는 분할이 필요한데, 분할 시에도 JSX/CSS 원본을 유지하고 헬퍼만 별도 파일로 이동한다.

---

## 단계별 산출물

| 단계 | 산출물 | 핵심 결정 |
|---|---|---|
| Stage 1 | 기존 마스터 API 정리/확장 + window.* 0건 + 홈/채널 화면 실제 DB | 신규 API 대량 추가 X. 기존 vertical slice 활용 |
| Stage 2 | METRIC_* 4테이블 + metrics 모듈 + 시드 메트릭 + ChannelTrend 일반화 | TEAMS 신설 X. dept_id로 통일. CUSTOMER_ID는 NUMBER |
| Stage 3 | AIPanel 라이브 + 작업 자동 추출 + 트렌드 인사이트 | useCase resolver/JSON wrapper/SSE helper 선행 보강 |

각 단계는 독립적으로 배포 가능하고 다음 단계 없이도 동작한다.

---

## 관련 문서

- [01-stage1-master-data-home-channel.md](01-stage1-master-data-home-channel.md) — Stage 1 상세
- [02-stage2-trend-generalization.md](02-stage2-trend-generalization.md) — Stage 2 상세 (DDL, 시드, API)
- [03-stage3-ai-integration.md](03-stage3-ai-integration.md) — Stage 3 상세 (AIPanel, 작업 추출, 인사이트)
- [04-critical-review.md](04-critical-review.md) — 구현 전 체크리스트와 결정 근거
- [99-verification.md](99-verification.md) — 단계별 검증 시나리오
- [../architecture/overview.md](../architecture/overview.md) — 시스템 전체 그림 (이 작업의 상위 컨텍스트)
- [../phase/databank-modernization.md](../phase/databank-modernization.md) — 현행화 작업의 모태 계획
