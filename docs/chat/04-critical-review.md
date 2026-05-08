# 구현 전 체크리스트와 결정 근거

이 문서는 `docs/chat` 계획서를 실제 코드베이스(`C:\Dev\Databank`)와 1:1로 대조한 결과를 정리한 것이다. 본 라운드(2026-05-07)에 발견된 코드↔문서 정합성 이슈를 본문 5개 문서에 모두 반영했고, 본 문서는 그 결정의 근거와 구현 시작 전 점검 항목을 보존한다.

본 문서는 새 정보 출현 시 갱신한다. 다른 문서가 본 문서를 참조한다.

---

## 1. 코드 기준 사실 (검증 매핑)

| 영역 | 코드 기준 사실 | 검증 근거 (파일:라인) |
|---|---|---|
| 인증 | `GET /api/auth/me` 이미 존재. 로그인은 `email`이 아니라 `username` | `backend/src/modules/auth/routes/authRoutes.ts:60-95` |
| 조직/팀 | `TEAMS` 테이블 없음. `WEEKLY_REPORTS.TEAM_ID` 는 `DEPARTMENTS.DEPT_ID` FK | `backend/src/modules/weekly-report/schema/weeklyReportSchema.ts:5,18,29` |
| 고객사 PK | `CUSTOMERS.CUSTOMER_ID NUMBER` (VARCHAR2 아님) | `backend/src/modules/customers/schema/customerSchema.ts:19,31,44` |
| 서비스 마스터 PK | `SERVICE_MASTERS.MASTER_ID VARCHAR2(100 CHAR)` | `backend/src/modules/settings/service-masters/schema/serviceMasterSchema.ts:16,25` |
| 라우트 마운트 | `/api/service-master` (단수). 모듈 폴더는 `service-masters` (복수) — 불일치 존재 | `backend/src/app.ts:62`, `serviceMasterRoutes.ts:3` |
| 메시징 | `messagingRouter` 가 `/api/channels` 에 마운트. 메시지 라우트는 그 하위 | `backend/src/app.ts:66` |
| AI 모델 카탈로그 | `AI_MODELS` 에 `USE_CASES VARCHAR2(500 CHAR)` CSV 컬럼 존재. `MODEL_TYPE` 컬럼은 마이그레이션으로 추가됨 | `backend/src/modules/settings/ai-models/schema/aiModelSchema.ts:30,41` |
| AI 모델 선택 | `resolveModel(connection, modelType)` 은 `'embedding'\|'reranker'\|'llm'` 만 받는다. useCase 별 선택 미지원 | `backend/src/modules/knowledge-base/services/ai/aiModelResolver.ts:37-39` |
| LLM 호출 | `chatOnce(connection, messages)` 는 JSON mode 옵션을 받지 않는다 | `backend/src/modules/knowledge-base/services/generator/llmRouter.ts:87-105` |
| KB 검색 | 함수명은 `hybridSearch(connection, query, topK, rerankTopK, mode)` | `backend/src/modules/knowledge-base/services/retriever/hybridFusion.ts:59`, `routes/kbSearchRoutes.ts:18,47,131` |
| 프론트 SSE | 브라우저 `EventSource` 는 GET-only. KB는 `fetch + ReadableStream` 으로 처리하는 `askStream()` 사용 | `frontend/src/features/knowledge-base/api/kbSearchApi.ts:35-80` |

---

## 2. 핵심 설계 결정

### 2.1 팀 모델은 DEPARTMENTS 로 통일

현재 DB와 코드에서는 팀/부서를 `DEPARTMENTS` 로 표현한다. `WEEKLY_REPORTS.TEAM_ID` 도 실제로는 `DEPARTMENTS.DEPT_ID` FK 다. 따라서 본 라운드의 모든 문서는 다음 원칙을 따른다.

- 프론트 명칭은 `team` 을 유지해도 내부 식별자는 `deptId` 를 쓴다
- 신규 DB 컬럼은 `team_id` 가 아니라 `dept_id`
- `TEAMS` 테이블 추가는 보류한다. 별도 팀 개념이 필요하다는 제품 결정이 있을 때만 ADR 로 분리

### 2.2 Stage 1은 "신규 API 7종"이 아니라 "기존 API 정리 + 누락 옵션 추가"

이미 존재하는 API가 많다. 현실적인 작업 범위는 다음이다.

- `/api/auth/me`: 이미 있음. 응답 필드 정규화만
- `/api/org/departments` / `users` / `positions`: 이미 있음
- `/api/customers`: 이미 있음. `q`, `limit`, 담당자 필터 옵션 추가
- `/api/support-history`: 이미 있음. camelCase query 통일
- `/api/weekly-reports`: 이미 있음. 고객사 채널용 보고서 조회는 별도 조인 endpoint 가 필요할 때만 신설
- `/api/service-master`: 이미 있음. 경로 명칭 결정만 남았음

상세 매핑은 [01-stage1-master-data-home-channel.md](01-stage1-master-data-home-channel.md) 의 § 2.

### 2.3 AI use case 는 테이블 추가보다 resolver 변경이 먼저

`AI_MODELS` 에는 `USE_CASES` CSV 와 `MODEL_TYPE` 이 이미 있다. 따라서 `AI_USE_CASES` 카탈로그 테이블을 새로 만드는 대신 다음 함수를 먼저 추가한다.

```ts
resolveLlmModelForUseCase(connection, useCase)
  1. MODEL_TYPE = 'llm'
  2. STATUS = 'active'
  3. USE_CASES 에 useCase 포함된 모델 우선
  4. 없으면 IS_DEFAULT = 1 모델 fallback
```

이렇게 해야 `channel_assistant`, `task_extractor`, `trend_insight` 가 실제로 다른 모델을 선택할 수 있다. 라벨/설명 카탈로그가 필요해지면 `AI_USE_CASES` 테이블은 후속 작업으로 분리한다.

### 2.4 POST SSE 는 fetch + ReadableStream 으로 구현

브라우저 `EventSource` 는 GET 만 지원한다. 따라서 AIPanel SSE를 `EventSource(POST)` 형태로 구현하면 동작하지 않는다. 현재 KB 가 `fetch(..., { method: 'POST' })` 후 `ReadableStream` 을 파싱하는 구조이므로, 그 패턴을 공용 helper 로 끌어올린다.

권장 위치:

```text
frontend/src/shared/api/sseClient.ts
```

기존 `features/knowledge-base/api/kbSearchApi.ts` 의 `askStream` 도 이 helper 를 쓰도록 정리한다.

### 2.5 ENABLED 플래그는 NUMBER(1)

기존 패턴(`SERVICE_MASTERS.ENABLED NUMBER(1) DEFAULT 1`, `AI_MODELS.IS_DEFAULT NUMBER(1) DEFAULT 0`) 과 일관. Stage 2 신규 테이블의 `enabled` 컬럼은 `NUMBER(1) DEFAULT 1 NOT NULL` 로 둔다.

### 2.6 메시지 라우트는 messagingRouter 하위

`/api/messages` 는 마운트되어 있지 않다. 메시지 관련 신규 라우트(작업 추출 등)는 `/api/channels/:channelId/messages/:messageId/...` 형태로 `messagingRouter` 아래에 추가한다.

---

## 3. 우선순위 조정

### 유지

- `window.*` 업무 mock 제거
- `ChannelTrend` 일반화 (4-테이블 모델)
- KB RAG 인프라 재사용
- AI 실패 시 silent failure 금지
- UI 디자인 보존

### 축소

- Stage 1의 신규 API 수: 7종 신규 → 기존 API 확장 중심
- Stage 2의 수집 Agent: 최초 구현은 수동 입력 + batch ingest 모의 호출까지
- Stage 3의 이미지 OCR: 이번 라운드 제외

### 선행 (구현 첫 작업)

- `/api/service-master` 경로 결정 (단수 유지 권장)
- `deptId / teamId` 명칭 정리 — 내부 식별자는 `deptId`
- `resolveLlmModelForUseCase` 추가
- `chatOnceWithModel` / `streamChatWithModel` (JSON 옵션 + 모델 인자형) wrapper 추가
- `frontend/src/shared/api/sseClient.ts` (POST + ReadableStream) 공용 helper 추가
- `citationExtractor` 의 번호 레지스트리를 메시지/이력/KB 통합으로 확장
- 검증 명령 PowerShell + `rg` 기준으로 정리

---

## 4. 구현 전 체크리스트

```text
[ ] 프론트에서 제거 대상 window.* 목록을 rg 로 재측정한다.
[ ] 브라우저/플랫폼 API window 사용은 제거 대상에서 제외한다.
[ ] TEAMS 신규 도입 여부를 결정한다 (기본값: 도입하지 않음).
[ ] /api/service-master 경로를 단수형 유지로 확정한다 (또는 복수형 alias 추가).
[ ] 고객사 채널 보고서 조회가 필요한지, 팀 주간보고만으로 충분한지 결정한다.
[ ] resolveLlmModelForUseCase, chatOnceWithModel, streamChatWithModel 선행 추가.
[ ] AIPanel SSE 는 fetch + ReadableStream 공용 helper 로 구현.
[ ] citationExtractor 번호 레지스트리 확장 설계 (메시지/이력/KB 통합).
[ ] 검증 명령을 PowerShell + rg 기준으로 정리한다.
[ ] METRIC_DEFINITIONS / MONITOR_TARGETS / TARGET_METRIC_OVERRIDES 의 enabled 컬럼은 NUMBER(1) DEFAULT 1.
[ ] METRIC_SAMPLES FK 제약은 application 레벨 검증 (partition 운영 부담 회피).
[ ] /api/metrics/ingest 토큰은 env 변수로 시작, AI_PROVIDERS 에는 넣지 않음.
```

---

## 5. 본문 5개 문서 정합성 매핑

| 문서 | 보정 반영 내역 |
|---|---|
| [00-architecture.md](00-architecture.md) | 그림에서 `TEAMS` 표기 제거하고 `DEPARTMENTS` 표기. AI 통합 지점 표에 wrapper 함수명 명시. 선행 보강 섹션 추가. ER 그림에서 `AI_USE_CASES` 제거하고 `AI_MODELS (USE_CASES 활용)` 으로 단순화. |
| [01-stage1-master-data-home-channel.md](01-stage1-master-data-home-channel.md) | 신규 API 7종 → 기존 API 매핑 표로 구조 변경. `dept_id` 통일 명시. 검증 명령 PowerShell + `rg`. |
| [02-stage2-trend-generalization.md](02-stage2-trend-generalization.md) | DDL 의 `customer_id/dept_id/created_by` 를 `NUMBER` 로, `service_master_id` 를 `VARCHAR2(100 CHAR)` 로 정정. `enabled NUMBER(1) DEFAULT 1` 통일. METRIC_AGGREGATES 를 Stage 2-2 선택 산출물로 분리. METRIC_SAMPLES FK 는 application 레벨. Ingest 토큰은 env 시작. |
| [03-stage3-ai-integration.md](03-stage3-ai-integration.md) | 선행 보강 4종 명시(`resolveLlmModelForUseCase`, `chatOnceWithModel`, `streamChatWithModel`, `sseClient.ts`). 함수명 `hybridSearch` 로 보정. 라우트는 `/api/channels/:channelId/messages/:messageId/extract-task` 로 messagingRouter 하위. AI_MODELS USE_CASES CSV 활용 (별도 카탈로그 테이블 X). |
| [99-verification.md](99-verification.md) | PowerShell + `rg` 기준 명령. `username` 로그인. camelCase query. `/api/weekly-reports?weekStart=&teamId=`. `AI_MODELS.USE_CASES LIKE '%channel_assistant%'` 검사. |

---

## 6. 향후 본 문서 갱신 시기

다음 사건이 발생하면 이 문서를 갱신한다.

- Stage 1/2/3 구현 시작 시 추가 발견된 코드↔문서 불일치
- DDL/스키마 변경 후 본 문서의 "코드 기준 사실" 표가 더 이상 사실이 아니게 될 때
- 선행 보강(`resolveLlmModelForUseCase` 등)이 PR로 반영되면 본 문서의 "선행" 항목을 "완료"로 옮긴다

본 문서가 갱신되면 다른 5개 문서도 같이 갱신해야 정합성이 유지된다.
