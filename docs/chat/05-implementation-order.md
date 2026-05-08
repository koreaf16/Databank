# 구현 순서

Stage 0(선행) → Stage 1(마스터 데이터·홈/채널 현행화) → Stage 2(트렌드 일반화) → Stage 3(AI 연결) 순서로 진행한다. 번호는 의존 순서이며, 같은 번호 그룹은 병렬 작업 가능하다.

각 단계 완료 기준은 `docs/chat/99-verification.md` 의 해당 검증 절에서 확인한다.

---

## Stage 0 — 선행 보강

다른 Stage 전에 반드시 완료한다. 여기서 만든 함수와 helper를 Stage 1–3 이 공유한다.

### 0-1. 경로·명칭 확정 (코드 변경 없음, 결정만)

- `/api/service-master` 경로는 **단수형 그대로 유지**. 복수형 alias 필요 여부는 프론트 연결 시 재확인.
- 내부 식별자는 `deptId` 통일 (`teamId` 사용 파일을 `rg "teamId"` 로 확인).

### 0-2. resolveLlmModelForUseCase 추가

**파일**: `backend/src/modules/knowledge-base/services/ai/aiModelResolver.ts`

기존 `resolveModel(conn, modelType)` 아래에 함수 추가:

```
resolveLlmModelForUseCase(conn, useCase):
  1. MODEL_TYPE = 'llm', STATUS = 'active'
  2. USE_CASES LIKE '%<useCase>%' 인 모델 우선 반환
  3. 없으면 IS_DEFAULT = 1 인 llm 모델 fallback
  4. 그것도 없으면 throw (silent failure 금지)
```

### 0-3. chatOnceWithModel / streamChatWithModel 추가

**파일**: `backend/src/modules/knowledge-base/services/generator/llmRouter.ts`

기존 `chatOnce` / `streamChat` 시그니처를 건드리지 않고 wrapper 추가:

| 함수 | 시그니처 | 추가 기능 |
|---|---|---|
| `chatOnceWithModel(model, messages, opts?)` | `model`: `AI_MODELS` 행 객체 | `responseFormat: 'json'` 옵션. OpenAI → `response_format`, Ollama·Anthropic → 시스템 프롬프트 강제 + 파싱 실패 재시도 1회 |
| `streamChatWithModel(model, messages, onToken)` | 동상 | 모델 인자형 스트리밍 wrapper |

### 0-4. sseClient.ts 공용 helper 추가

**파일**: `frontend/src/shared/api/sseClient.ts` (신규)

브라우저 `EventSource` 는 GET-only 이므로 POST + SSE 는 `fetch + ReadableStream` 으로 처리한다. 현재 `kbSearchApi.askStream` 안에 이미 이 패턴이 있다 — 그것을 공용 helper로 끌어올린다.

```
postSseStream(url, body, onToken, onDone, onError):
  fetch(url, { method: 'POST', body: JSON.stringify(body) })
  → ReadableStream 읽기 루프
  → data: 라인 파싱 → onToken 콜백
  → [DONE] 수신 시 onDone 콜백
  → 네트워크/파싱 오류 시 onError 콜백 (절대 조용히 삼키지 않음)
```

기존 `kbSearchApi.askStream` 이 이 helper를 쓰도록 정리한다(작은 리팩터).

---

## Stage 1 — 마스터 데이터 + 홈/채널 현행화

### 1-1. window.* 업무 mock 대상 확정

```powershell
rg -n "window\.(ME|TEAMS|MY_TEAM|CUSTOMERS|MY_CUSTOMERS|HISTORY|SUPPORT_HISTORIES|SERVICE_TEMPLATES|FREQ_BY_ID|ENGINEERS|POSITIONS|DIRECT_MESSAGES|TEAM_CHANNELS|MY_TEAM_CHANNELS|GROUP_TAGS|PROJECTS)" frontend/src
```

브라우저 표준 API(`window.location`, `window.confirm`, `window.matchMedia` 등)는 제거 대상 아님.

결과를 기록해 두고, 이후 작업 완료 시 0건인지 재확인한다.

### 1-2. 백엔드 기존 API 확장

이미 존재하는 라우트에 누락 옵션만 추가한다. 신규 라우트는 최소화.

| 작업 항목 | 파일 위치 | 변경 내용 |
|---|---|---|
| `GET /api/auth/me` 응답 정규화 | `auth/routes/authRoutes.ts` | `userId, username, name, deptId, role` 필드 포함 확인·추가 |
| `GET /api/customers` 검색 옵션 | `customers/routes/` | `q`, `limit`, `assignedTo` 쿼리 파라미터 추가 |
| `GET /api/support-history` camelCase 통일 | `support-history/routes/` | `customerId`, `engineerId`, `from`, `to` (snake_case → camelCase) |
| `GET /api/weekly-reports?weekStart=&teamId=` | `weekly-report/routes/` | `teamId` 가 실제로 `DEPARTMENTS.DEPT_ID` FK 임을 확인·문서화 |
| `GET /api/customers/:id/frequency` (선택) | customers 또는 routine-plans | `window.FREQ_BY_ID` 대체. Stage 2 metrics 완료 후 자연 해소 가능 — 필요 여부 확인 후 결정 |
| 고객사 채널 보고서 조인 endpoint (선택) | `weekly-report/routes/` | `WEEKLY_REPORT_ITEMS + SUPPORT_HISTORIES` 조인. 팀 주간보고만으로 충분하면 생략 |

### 1-3. 프론트엔드 API 래퍼 추가

`frontend/src/api/` 아래에 없는 파일만 신규 작성한다.

```
userApi.ts          → getMe()                        /api/auth/me
deptApi.ts          → listDepartments()              /api/org/departments
userListApi.ts      → listUsers({ deptId, role })    /api/org/users
customerApi.ts      → searchCustomers({ q, limit })  /api/customers
historyApi.ts       → listHistories(filter)          /api/support-history
serviceMasterApi.ts → listServiceMasters()           /api/service-master
reportApi.ts        → listReports(filter)            /api/weekly-reports
```

### 1-4. UserContext / MasterDataContext 도입

**신규 파일**:
- `frontend/src/contexts/UserContext.tsx`
- `frontend/src/contexts/MasterDataContext.tsx`

**app.tsx 변경**:
- 앱 마운트 시 `getMe()` 호출 → `UserContext` 제공
- 부서·고객사·서비스 마스터 초기 목록 → `MasterDataContext` 제공
- `window.*` 전역 할당 코드 제거

### 1-5. window.* 참조 교체 (파일별)

| 파일 | 교체 대상 | 대체 방법 |
|---|---|---|
| `Workspace.tsx:54-58` | `window.ME`, `window.MY_TEAM`, `window.HISTORY` | `useUser()`, `useMasterData()` |
| `HomeInbox.tsx:114` | `window.ME` | `useUser()` |
| `Conversation.tsx:36-39` | `buildDMMessages()` | `/api/channels/:id/messages` (DM kind 동일 라우트) |
| `ChannelHistory.tsx:9` | `getHistoryParticipants()` | API 응답의 `participants[]` |
| `ChannelReports.tsx:73` | `buildMasterServiceReports()` | `/api/weekly-reports` 또는 신규 조인 endpoint |
| `Message.tsx:39` | `window.SERVICE_TEMPLATES` | `useMasterData().serviceMasters` |
| `ChannelTrend.tsx:35-36` | `window.TEAMS`, `window.FREQ_BY_ID` | **Stage 2** 에서 metrics 기반으로 교체 — 이 단계는 보류 |

### 1-6. data.ts / data2.js 제거

- 모든 import가 사라진 뒤 파일 삭제
- `rg "from.*data[\"']" frontend/src` 로 잔존 import 0건 확인

### 1-7. Stage 1 검증

`99-verification.md` §1 참조.

핵심 확인:

```powershell
# 업무 mock 직접 참조 0건
rg "window\.(ME|TEAMS|CUSTOMERS|HISTORY|SERVICE_TEMPLATES|FREQ_BY_ID)" frontend/src
# data.ts import 0건
rg "from.*['\"].*data['\"]" frontend/src
```

- 홈 4탭(멘션·미읽음·즐겨찾기·최근활동) 실제 데이터 표시
- DM 채널 클릭 → 실제 메시지 표시
- 권한별 데이터 격리 확인

---

## Stage 2 — 트렌드 일반화 (범용 시계열 메트릭)

### 2-1. DDL 작성 + 초기화 스크립트

**신규 파일**: `backend/src/scripts/initMetricSchema.ts`

기존 `initOrgCustomerSchema.ts` 패턴 그대로. 테이블 4개:

| 테이블 | 핵심 컬럼 | 비고 |
|---|---|---|
| `METRIC_DEFINITIONS` | `metric_id VARCHAR2(64) PK`, `system_type`, `category`, `unit`, `warn/crit_threshold`, `direction`, `enabled NUMBER(1) DEFAULT 1` | 시스템 타입별 메트릭 카탈로그 |
| `MONITOR_TARGETS` | `target_id VARCHAR2(64) PK`, `customer_id NUMBER FK`, `dept_id NUMBER FK`, `service_master_id VARCHAR2(100 CHAR) FK`, `system_type`, `status` | 고객사·부서별 모니터링 대상 |
| `METRIC_SAMPLES` | `sample_id NUMBER PK`, `target_id FK`, `metric_id FK`, `collected_at TIMESTAMP`, `value NUMBER`, `status`, `source`, `source_ref` | RANGE PARTITION BY `collected_at` (월별). FK 제약은 application 레벨 (파티션 운영 부담 회피) |
| `TARGET_METRIC_OVERRIDES` | `(target_id, metric_id) PK`, `warn_threshold`, `crit_threshold` | 고객사별 임계값 커스터마이징 |

인덱스: `METRIC_SAMPLES(target_id, collected_at DESC)`, `METRIC_SAMPLES(metric_id, collected_at)`.

### 2-2. 시드 메트릭 정의

**신규 파일**: `backend/src/scripts/seedMetricDefinitions.ts`

시스템 타입별 기본 메트릭 시드 (~50건):

| 시스템 타입 | 대표 메트릭 |
|---|---|
| `oracle` | 테이블스페이스 사용률, ASM 사용률, ARCHIVE 사용률, SGA Hit Ratio, Long Active Sessions |
| `mysql` | 데이터 디렉터리 사용률, InnoDB Buffer Pool Hit Ratio, 슬로우 쿼리/분 |
| `redis` | 메모리 사용률, eviction/sec, keyspace hit ratio |
| `linux` | `/` 디스크 사용률, `/var` 사용률, CPU load avg, 메모리 사용률 |
| `windows` | C: 사용률, 메모리 사용률, CPU 사용률 |
| `aws` | RDS Storage Free, CPU Utilization, DB Connections |
| `azure` | Managed Disk IOPS, SQL DTU 사용률 |
| `weblogic` | JVM Heap 사용률, Stuck Threads, JDBC 풀 사용률 |
| `postgres` | 데이터 디렉터리 사용률, 연결 수/max, 슬로우 쿼리/분 |
| `mongodb` | 데이터 디렉터리 사용률, 연결 수, 복제 지연 |

전체 정의(name, unit, warn/crit threshold, direction)는 `02-stage2-trend-generalization.md` §3 표 참조.

### 2-3. metrics 백엔드 모듈

**신규 디렉터리**: `backend/src/modules/metrics/`

구조는 다른 모듈(schema / repository / routes)과 동일.

| 엔드포인트 | 용도 |
|---|---|
| `GET /api/metrics/definitions?system_type=` | 메트릭 정의 목록 |
| `POST /api/metrics/definitions` | 정의 추가 (관리자) |
| `GET /api/metrics/targets?customerId=&system_type=` | 모니터링 대상 목록 |
| `POST /api/metrics/targets` / `PUT /:id` / `DELETE /:id` | 대상 CRUD |
| `GET /api/metrics/samples?targetId=&metricId=&from=&to=&agg=` | 시계열 조회 (agg: raw/hour/day/month) |
| `POST /api/metrics/ingest` | Agent push (배치, 토큰 인증) |
| `POST /api/metrics/manual` | 수동 입력 |
| `GET /api/metrics/risk?customerId=` | 위험 Top N |

ingest 인증 토큰은 `process.env.METRICS_INGEST_TOKEN` — `AI_PROVIDERS` 테이블에 넣지 않는다.

`app.ts` 에 `/api/metrics` 마운트 추가.

### 2-4. ChannelTrend.tsx 마이그레이션

- `buildCapacityObservations()` (388–421번 줄) 제거
- `GET /api/metrics/risk?customerId=` → KPI 카드 + Top 10 위험
- `GET /api/metrics/samples?targetId=&metricId=&...` → 차트 + 상세표
- `kindFilter` 옆에 `systemTypeFilter` 신설 (Oracle / MySQL / Redis / 서버 / 전체)
- `CAPACITY_KIND_LABELS` / `CAPACITY_KIND_SHORT` hardcode 제거 → 메트릭 정의 응답으로 동적 구성
- 파일이 500줄을 넘기면 `frontend/src/features/messaging/parts/trend/` 하위로 분리
  - `TrendChart.tsx`, `TrendHeatmap.tsx`, `TrendKpiCards.tsx`, `trendUtils.ts`
- `ChannelTrend.tsx:35-36` 의 `window.TEAMS`, `window.FREQ_BY_ID` 참조 이 단계에서 제거

### 2-5. 미사용 components/ChannelTrend.tsx 삭제

`frontend/src/components/ChannelTrend.tsx` (27KB, 미사용 v2) — import 0건 확인 후 삭제.

### 2-6. Stage 2 검증

`99-verification.md` §2 참조.

핵심 확인:

- 시드 메트릭 100건 이상 등록
- 수동 입력 1건 → 트렌드 차트 정상 표시
- Agent push 모의 배치 1000건 → 1초 이내 ingest 완료
- 시스템 타입 필터로 MySQL만 / Oracle만 전환
- 임계값 오버라이드 — 특정 고객사만 다른 색으로 표시

---

## Stage 3 — AI 연결

### 3-1. AI use_case 3종 등록

현재 활성화된 LLM 모델의 `USE_CASES` CSV에 `channel_assistant`, `task_extractor`, `trend_insight` 추가.

```sql
UPDATE AI_MODELS
   SET USE_CASES = USE_CASES || ',channel_assistant,task_extractor,trend_insight'
 WHERE MODEL_TYPE = 'llm'
   AND IS_DEFAULT = 1
   AND STATUS = 'active';
```

use case별로 다른 모델을 쓰려면 `Settings → AI 모델` 에서 행별로 `useCases` 나눠 저장.

### 3-2. channelAssistant.ts 서비스 신규

**파일**: `backend/src/modules/messaging/services/channelAssistant.ts`

```
answerChannelQuestion(channelId, question, onToken):
  1. 채널 최근 메시지 50건 조회
  2. channelId → customerId 조회
  3. 해당 고객사 최근 이력 5건 조회
  4. hybridSearch(conn, question, 5, 3, 'hybrid') — KB 청크 3건
  5. 채널 전용 promptBuilder로 컨텍스트 조립
     (메시지 인용 [M1], 이력 인용 [H1], KB 인용 [K1] — 번호 레지스트리 통합)
  6. resolveLlmModelForUseCase(conn, 'channel_assistant') → model 객체
  7. streamChatWithModel(model, prompt, onToken)
```

LLM 실패 시 `throw` — 조용히 삼키지 않음. 호출부에서 "AI 일시 응답 불가" 메시지 표시.

### 3-3. assistant 라우트 추가

`messagingRouter` 하위에 추가 (`/api/channels` 마운트 기준):

| 엔드포인트 | 용도 |
|---|---|
| `POST /api/channels/:id/assistant/ask` (SSE) | 질문 + 컨텍스트 → 답변 스트리밍 |
| `POST /api/channels/:id/assistant/summary` | 채널 최근 5일 요약 (AIPanel 진입 시 자동 호출 가능) |

### 3-4. AIPanel.tsx 활성화

**파일**: `frontend/src/features/messaging/parts/AIPanel.tsx` (현재 60줄 스텁)

- `<input>` onSubmit → `postSseStream('/api/channels/:id/assistant/ask', ...)` (`sseClient.ts` 사용)
- "이번 주 보고서 초안 작성" / "유사 장애 사례 검색" 버튼에 핸들러 연결
- 출력 영역에 토큰 스트리밍 표시
- 인용 `[M1]`, `[H1]`, `[K1]` 클릭 시 원본으로 이동
- LLM 실패 시 "AI 일시 응답 불가" 명시적 표시 (빈 화면 금지)

### 3-5. taskExtractor.ts 서비스 신규

**파일**: `backend/src/modules/messaging/services/taskExtractor.ts`

```
extractTask(messageId, body):
  1. resolveLlmModelForUseCase(conn, 'task_extractor') → model
  2. chatOnceWithModel(model, prompt, { responseFormat: 'json' })
     — 출력 스키마: { taskName, customerCandidate, priority, category,
                      estimatedHours, relatedMetrics, suggestedActions }
  3. JSON 파싱 실패 시 재시도 1회, 그래도 실패하면 throw (silent failure 금지)
  4. 저장 안 함 — 반환만
```

### 3-6. extract-task 라우트 추가

`messagingRouter` 하위:

| 엔드포인트 | 용도 |
|---|---|
| `POST /api/channels/:channelId/messages/:messageId/extract-task` | 추출만, 저장 X |
| `POST /api/channels/:channelId/messages/:messageId/extract-task/confirm` | 엔지니어 수정 결과 → `support-history` 등록 |

### 3-7. 작업카드 변환 UI

- `Message.tsx` 메시지 호버 시 "작업카드 변환" 버튼 활성화 (디자인 기존 것 재사용)
- 추출 결과 슬라이드 패널로 미리보기 + 인라인 편집
- 확정 버튼 → `/extract-task/confirm` 호출 → 이력 등록 완료 토스트
- LLM 실패 시 빈 폼으로 fallback (수동 입력 가능)

### 3-8. trendInsight.ts 서비스 신규

**파일**: `backend/src/modules/metrics/services/trendInsight.ts`

```
getTargetInsight(targetId):
  1. 최근 12개월 샘플에서 임계값 초과·근접 항목 추출 (DB 집계, LLM 호출 전)
  2. 선형회귀로 3개월 후 예측값 계산 (LLM 없는 순수 수식)
  3. hybridSearch(conn, 시스템타입 + 위험 지표 키워드, 3, 3, 'hybrid') — 과거 트러블슈팅 이력
  4. resolveLlmModelForUseCase(conn, 'trend_insight') → model
  5. chatOnceWithModel(model, 요약 프롬프트)
  6. 결과 1시간 TTL 캐시 (메모리 캐시, Redis 없음)
```

LLM 실패 시 통계 요약만 반환, 인사이트 카드는 "AI 분석 불가" 표시.

### 3-9. insights 라우트 추가

```
GET /api/metrics/insights/:targetId     — 단일 대상 이상치 인사이트
GET /api/metrics/insights?customerId=   — 고객사 전체 Top 5 이상치
```

### 3-10. AI 인사이트 UI 카드

`ChannelTrend.tsx` 에 "AI 인사이트" 카드 추가 (기존 `card card-pad` 스타일):

- Top 10 위험 박스 위 또는 아래에 배치
- `/api/metrics/insights?customerId=` 호출 → 자연어 요약 + 권장 액션 표시
- LLM 실패 또는 분석 불가 시 카드 숨김 (에러 로그는 콘솔)

### 3-11. Stage 3 검증 + 통합 dogfood

`99-verification.md` §3 + §4(전체 dogfood) 참조.

핵심 확인:

- AIPanel: "지난주 점검 요약해줘" → 5초 이내 첫 토큰, 인용 3건 이상
- 작업 추출: SSH 로그 한 줄 → 90% 이상에서 작업명·고객사 자동 채움
- 트렌드 인사이트: 임계값 근접 항목 3건 만들고 → 5초 이내 자연어 요약
- LLM 실패 graceful degradation 3종 모두 확인 (패널·추출·인사이트)

---

## 병렬 가능 작업 정리

| 병렬 그룹 | 포함 항목 |
|---|---|
| Stage 0 | 0-2, 0-3, 0-4 (서로 독립) |
| Stage 1 백엔드 | 1-2의 각 API 확장 항목 |
| Stage 1 프론트 | 1-3(API 래퍼) + 1-4(Context) 완료 후, 1-5의 각 파일 병렬 교체 |
| Stage 2 | 2-1(DDL) + 2-2(시드) → 2-3(모듈) 완료 후 2-4(프론트) |
| Stage 3 | 3-2·3-5·3-8 서비스 파일은 병렬 개발 가능. 각 라우트·UI는 서비스 완료 후 연결 |

---

## 완료 기준 요약

| Stage | 완료 기준 |
|---|---|
| Stage 0 | 선행 함수 4종 코드에 존재, `kbSearchApi.askStream` 이 `sseClient.ts` 사용 |
| Stage 1 | `window.*` 업무 mock 직접 참조 0건, 홈/채널 화면이 실제 DB 데이터로 동작 |
| Stage 2 | 범용 메트릭 4-테이블 운영, 트렌드 화면이 시스템 타입 필터 포함 실제 데이터로 동작 |
| Stage 3 | AIPanel Q&A 라이브, 작업 자동 추출 + 승인 저장, 트렌드 AI 인사이트 표시 |
