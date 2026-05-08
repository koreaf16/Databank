# Stage 3 — AI 연결 (KB RAG 인프라 재사용)

## 1. 단계 개요

DataBank Slack에는 이미 작동하는 AI 인프라가 있다 — 지식베이스(KB) RAG 파이프라인. `aiModelResolver` + `llmRouter` + `hybridSearch` + `promptBuilder` + `citationExtractor` 가 안정적으로 토큰 스트리밍 답변을 만들고 있다.

이 단계는 그 인프라를 **재사용**해 채널·홈 흐름에 AI를 자연스럽게 부착한다. 새 LLM 클라이언트는 만들지 않는다. 다만 현재 KB 전용으로 짜인 일부 함수에는 작은 보강이 필요하다(아래 2.1).

세 가지 기능을 추가한다.

1. **AIPanel 활성화** — 현재 스텁인 채널 우측 AI 패널을 라이브로. 채널 컨텍스트 + KB 검색 기반 Q&A
2. **메시지 → 작업카드 자동 추출** — SSH 로그/점검 결과를 붙이면 LLM이 작업명·고객사·우선순위·후속조치를 자동 채움. 엔지니어는 승인만 (메모리의 EUREKA 핵심 기능)
3. **트렌드 이상치 자동 인사이트** — 트렌드 화면에 AI가 자연어로 "이 고객사 USER_DATA TS는 3개월 내 포화 예상, 주요 원인은…" 식으로 요약

---

## 2. 재사용 인프라와 선행 보강

### 2.1 선행 보강 (Stage 3 첫 작업)

기존 KB 코드를 그대로 쓰기에는 다음이 부족하다. Stage 3 본 기능 구현 전에 선행으로 추가한다.

| 신규 함수 | 위치 | 이유 |
|---|---|---|
| `resolveLlmModelForUseCase(conn, useCase)` | `knowledge-base/services/ai/aiModelResolver.ts` 안에 추가 | 현 `resolveModel(conn, modelType)` 은 `'embedding'\|'reranker'\|'llm'` 만 받는다. `AI_MODELS.USE_CASES` CSV 컬럼을 필터링해 useCase 별 모델 선택 |
| `chatOnceWithModel(model, messages, opts?)` | `knowledge-base/services/generator/llmRouter.ts` 안에 추가 | 현 `chatOnce(conn, msgs)` 는 모델 인자를 받지 않고 옵션도 없다. `responseFormat: 'json'` 옵션 지원 (OpenAI는 `response_format`, Ollama/Anthropic은 시스템 프롬프트 강제 + 파싱 실패 재시도) |
| `streamChatWithModel(model, messages, onToken)` | 동상 | 모델 인자형 wrapper |
| `frontend/src/shared/api/sseClient.ts` | 신규 | 브라우저 `EventSource` 는 GET-only. 현재 KB는 `kbSearchApi.askStream` 안에서 `fetch + ReadableStream` 으로 처리한다. 그 패턴을 공용 helper로 끌어올림 |

기존 `kbSearchApi.askStream` 도 이 helper를 쓰도록 정리한다(작은 리팩터).

### 2.2 그대로 재사용

다음 파일은 변경하지 않고 import만 한다.

| 파일 | 역할 |
|---|---|
| `aiModelResolver.ts` 의 `resolveModel(conn, modelType)` | embedding/reranker/llm 기본 모델 조회 (60초 캐시). 그대로 활용 |
| `llmRouter.ts` 의 `chatOnce(conn, msgs)` / `streamChat(conn, msgs, onToken)` | 기본 LLM 호출. KB 그대로 사용. Stage 3은 `*WithModel` wrapper 경유 |
| `promptBuilder.ts` (KB 청크 → 프롬프트) | KB 답변용. Stage 3은 채널 전용 builder 별도 필요 |
| `citationExtractor.ts` | `[1]`, `[2]` 패턴 추출. **번호 레지스트리** 설계 보강 필요 (메시지/이력/KB 통합) |
| `hybridFusion.ts` 의 `hybridSearch(conn, query, topK, rerankTopK, mode)` | BM25+벡터+RRF. 그대로 호출 |
| `ollamaEmbedder.ts` | 임베딩 (검색 시 자동 호출) |

운영 변경: `AI_MODELS.USE_CASES` CSV에 use case 3종 등록.

```sql
UPDATE AI_MODELS
   SET USE_CASES = 'channel_assistant,task_extractor,trend_insight'
 WHERE MODEL_TYPE = 'llm'
   AND IS_DEFAULT = 1
   AND STATUS = 'active';
```

운영자가 use case 별로 다른 모델을 쓰려면 `Settings → AI 모델` 에서 각 모델 행의 `useCases` 를 나눠 저장한다. resolver 보강이 끝나면 자동 반영된다.

`AI_USE_CASES` 같은 라벨 카탈로그 테이블 도입은 본 단계의 필수가 아니다 — 후속 선택지.

---

## 3. 기능 1 — AIPanel 활성화

### 3.1 현재 상태

`frontend/src/features/messaging/parts/AIPanel.tsx` 60줄. UI는 있지만 클릭 핸들러 없음. "이번 주 보고서 초안 작성", "유사 장애 사례 검색" 두 버튼 비활성. 입력창도 동작 안 함.

### 3.2 백엔드

`backend/src/modules/messaging/services/channelAssistant.ts` 신규.

```
async function answerChannelQuestion(channelId, question, onToken):
  withConnection(async (c) => {

    // 1. 채널 컨텍스트 수집
    const messages   = await fetchRecentMessages(c, channelId, 50)
    const customerId = await getChannelCustomer(c, channelId)
    const histories  = customerId
      ? await fetchRecentHistories(c, customerId, 5)
      : []

    // 2. KB 하이브리드 검색
    const kbChunks = await hybridSearch(c, question, 3, undefined, 'hybrid')

    // 3. 컨텍스트 조립 (KB buildMessages가 아니라 채널 전용 builder)
    const llmMessages = buildChannelAssistantMessages({
      channelMessages: messages,
      supportHistories: histories,
      kbChunks,
      question,
      systemPrompt: CHANNEL_ASSISTANT_SYSTEM_PROMPT
    })

    // 4. LLM 스트리밍
    const model = await resolveLlmModelForUseCase(c, 'channel_assistant')
    await streamChatWithModel(model, llmMessages, onToken)
  })
```

**시스템 프롬프트** (요지):
> 너는 DataBank Slack의 AI 어시스턴트. 사용자는 SI 엔지니어. 답변 원칙: (a) 한국어, (b) 인용은 [1], [2] 형식 — 메시지/이력/KB 청크 ID로 매핑, (c) 추측 금지 — 컨텍스트에 없으면 "확인 어려움", (d) 코드/명령어는 코드블록.

### 3.3 라우트

| 메서드 | 경로 | 응답 |
|---|---|---|
| POST | `/api/channels/:channelId/assistant/ask` | POST + ReadableStream (event: token / citation / done / error) |
| POST | `/api/channels/:channelId/assistant/summary` | 채널 최근 5일 요약 (AIPanel 진입 시 자동 호출 가능) |

`messagingRouter` 가 이미 `/api/channels` 에 마운트되어 있다. 위 라우트는 그 아래 하위 경로로 추가한다.

스트림 형식은 KB Ask와 같은 event 기반(`event: token`, `event: done`, `event: error`). 클라이언트는 `shared/api/sseClient.ts` helper로 파싱.

### 3.4 프론트엔드

`frontend/src/features/messaging/parts/AIPanel.tsx` 재구현 (디자인은 100% 보존).

```ts
const [messages, setMessages] = useState<ChatMsg[]>([])
const [input, setInput] = useState('')
const [streaming, setStreaming] = useState(false)
const abortRef = useRef<() => void>()

async function handleSend() {
  if (!input.trim() || streaming) return
  setMessages(m => [...m, { role: 'user', text: input }])
  setStreaming(true)

  const botMsg: ChatMsg = { role: 'bot', text: '', citations: [] }
  setMessages(m => [...m, botMsg])

  abortRef.current = postSseStream(
    `/api/channels/${channel.id}/assistant/ask`,
    { question: input },
    {
      onEvent(event, payload) {
        if (event === 'token')    botMsg.text += payload.token
        if (event === 'citation') botMsg.citations.push(payload)
        if (event === 'done')     setStreaming(false)
        setMessages(m => [...m.slice(0, -1), { ...botMsg }])
      },
      onError(message) {
        setStreaming(false)
        showToast(message || 'AI 응답 실패. 잠시 후 다시 시도해주세요.')
      }
    }
  )
  setInput('')
}
```

기존 60줄 JSX 그대로 유지. `<input>` 에 `onChange`, `onKeyDown(Enter)` 만 추가. 기존 두 제안 버튼 클릭 시 입력창에 텍스트 채움 + 즉시 send.

응답 텍스트 안의 `[1]`, `[2]` 는 `<button class="citation">` 으로 렌더링 → 클릭 시 원본(메시지/이력/KB) 슬라이드 패널 표시. SlidePanel은 이미 `frontend/src/components/common/SlidePanel.tsx` 에 존재.

### 3.5 Empty / Loading / Error

- 진입 직후: 자동으로 "지난 7일 요약" 호출 → 첫 봇 메시지로 표시
- 스트리밍 중: 입력창 비활성 + spinner
- 실패: 토스트 + 봇 메시지에 "AI 일시 응답 불가" 표시 (silent failure 절대 금지)
- KB 검색 결과 0건: 그래도 답변 시도 (KB 없이 채널/이력만으로). 답변 시작이 "관련 KB 자료가 없어 채널 기록만으로 답변드립니다" 로 시작하도록 시스템 프롬프트에 지시

---

## 4. 기능 2 — 메시지 → 작업카드 자동 추출

### 4.1 핵심 가치 (메모리 기반)

> 엔지니어가 등록을 깜빡한다 → 대표이사 짜증. 진짜 원인은 DCM 항목이 너무 많아 모바일 입력 어려움. EUREKA = SSH 로그가 이미 디지털·구조화 데이터이므로 LLM이 자동 추출 → 엔지니어는 승인+사인만. 입력 5분 → 30초.

이 기능이 그 EUREKA의 첫 구현이다.

### 4.2 백엔드

`backend/src/modules/messaging/services/taskExtractor.ts` 신규.

```ts
async function extractTaskFromMessage(messageId) {
  return withConnection(async (c) => {
    // 1. 메시지 + 채널 + 고객사 컨텍스트 로드
    const msg      = await fetchMessage(c, messageId)
    const channel  = await fetchChannel(c, msg.channelId)
    const customer = channel.customerId
      ? await fetchCustomer(c, channel.customerId)
      : null

    // 2. 메시지 첨부물 (스크린샷/로그 파일) 텍스트 추출
    const attachmentText = msg.attachment
      ? await extractAttachmentText(msg.attachment)
      : ''

    // 3. 시스템 프롬프트 + 사용자 컨텍스트 구성
    const systemPrompt = `너는 SI 운영 보조 AI. 다음 메시지에서 작업 카드를 추출한다.
출력은 반드시 JSON, 다음 스키마 강제:
{
  "taskName":         string,                              // 1줄 작업명 (한국어)
  "customerId":       number | null,                       // 추정 고객사 ID
  "category":         "routine"|"incident"|"install"|"investigation",
  "priority":         "low"|"medium"|"high"|"urgent",
  "estimatedMinutes": number,
  "serviceName":      string | null,                       // Oracle, MySQL, Redis 등
  "summary":          string,                              // 2-3문장 요약 (한국어)
  "actions":          [{ "label": string, "completed": boolean }],
  "followUp":         string | null,
  "confidence":       number                                // 0.0-1.0
}
근거 부족 필드는 null. 추측 금지.`

    const userPrompt = `채널: ${channel.name}
${customer ? `고객사: ${customer.name} (id=${customer.id})` : ''}
메시지 본문:
<message>
${msg.body}
</message>
${attachmentText ? '첨부:\n' + attachmentText : ''}`

    // 4. LLM 호출 (JSON mode)
    const model = await resolveLlmModelForUseCase(c, 'task_extractor')
    const response = await chatOnceWithModel(
      model,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ],
      { responseFormat: 'json' }
    )

    // 5. 검증 + 보정
    const parsed = JSON.parse(response)
    validateTaskSchema(parsed)              // 필수 필드 누락 시 에러
    if (parsed.customerId == null && customer) {
      parsed.customerId = customer.id       // 채널 고객사로 기본값
    }
    return parsed
  })
}
```

저장은 별도 단계. 추출 결과만 반환.

확정 단계:

```ts
async function confirmTaskExtraction(messageId, editedTask, userId) {
  return withTransaction(async (c) => {
    const historyId = await supportHistoryRepo.insert(c, {
      ...editedTask,
      createdBy: userId,
      source: `message:${messageId}`
    })
    await auditRepo.log(c, {
      actor: userId,
      action: 'task.extracted-from-message',
      targetType: 'support-history',
      targetId: historyId,
      payload: { messageId }
    })
    return historyId
  })
}
```

### 4.3 라우트

`messagingRouter` 가 `/api/channels` 마운트이므로, 메시지 라우트도 그 하위 경로로 둔다.

| 메서드 | 경로 | 응답 |
|---|---|---|
| POST | `/api/channels/:channelId/messages/:messageId/extract-task` | `{ extracted: {...}, confidence: 0.92 }` |
| POST | `/api/channels/:channelId/messages/:messageId/extract-task/confirm` | `{ historyId, ok: true }` |

### 4.4 프론트엔드 — 인라인 편집 카드

메시지 호버 시 `📋 작업카드 변환` 버튼 표시 (`Message.tsx` 액션 영역).

클릭 → 슬라이드 패널 (`SlidePanel.tsx` 재사용)에 미리보기 카드:

```
┌─ 작업카드 추출 결과 ─────────────────────────┐
│ 신뢰도 92%  [재추출]                         │
│ ────────────────────────────────────────── │
│ 작업명     [USER_DATA 테이블스페이스 확장 ] │
│ 고객사     [△△증권 (자동 인식)        ▼ ] │
│ 분류       [routine ▼]   우선순위 [high ▼] │
│ 서비스     [Oracle 19c                  ] │
│ 예상소요   [60] 분                          │
│ ────────────────────────────────────────── │
│ 요약                                        │
│ [USER_DATA TS가 92% 도달, 다음 점검까지...] │
│                                            │
│ 후속조치                                    │
│ [□] 임계값 알림 등록                       │
│ [□] 다음 분기 추가 datafile 검토           │
│ [+ 항목 추가]                              │
│ ────────────────────────────────────────── │
│         [취소]    [지원이력으로 등록 →]   │
└────────────────────────────────────────────┘
```

기존 19종 UX 보강 중 "AI 파싱 인라인 편집 카드" 디자인을 그대로 사용.

각 필드 인라인 편집. 신뢰도 70% 미만은 빨간색으로 강조 → "검토 필요".

### 4.5 검증 / 실패 처리

- LLM 응답이 JSON 파싱 실패: 1회 재시도 → 또 실패하면 빈 폼으로 패널 열림 (silent failure 금지, 명시적 "AI 추출 실패, 수동 입력해주세요" 표시)
- 신뢰도 50% 미만: 자동 등록 차단, 엔지니어 검토 강제
- 추출은 항상 가능, 등록은 RBAC 검증 (본인 또는 부서장)

---

## 5. 기능 3 — 트렌드 이상치 자동 인사이트

### 5.1 백엔드

`backend/src/modules/metrics/services/trendInsight.ts` 신규. (Stage 2 metrics 모듈 안)

```ts
async function generateTrendInsight({ customerId, targetId }) {
  return withConnection(async (c) => {
    // 1. 통계 계산 (LLM 안 씀)
    const recentSamples = await fetchSamplesLastMonths(c, { customerId, targetId, months: 12 })
    const stats = computeStats(recentSamples)
    //   - 임계값 초과/근접 항목 (현 status)
    //   - 6개월 이전 대비 변화율
    //   - 선형회귀로 N개월 후 예측치 (간단한 OLS)
    //   - 시스템 종류별 평균/최댓값

    // 2. KB 검색 — 같은 시스템 종류의 과거 트러블슈팅 이력
    const queries = stats.atRiskMetrics.map(m =>
      `${m.systemType} ${m.metricName} 사용률 ${m.percent}% 위험`
    )
    const kbChunks = await Promise.all(
      queries.map(q => hybridSearch(c, q, 2, undefined, 'hybrid'))
    )

    // 3. 시스템 프롬프트 — 자연어 요약 + 권장 액션
    const systemPrompt = `너는 SI 운영 분석 AI. 다음 메트릭 통계를 자연어로 요약하고 권장 액션 3-5개를 제안한다.
원칙: (a) 한국어, (b) 숫자 인용 시 정확한 값, (c) 비교는 % 변화율 명시,
(d) 권장 액션은 즉시 실행 가능한 동작 (체크리스트), (e) 추측 금지.`

    const userPrompt = JSON.stringify({ stats, kbExcerpts: kbChunks }, null, 2)

    // 4. LLM 호출 (단발)
    const model = await resolveLlmModelForUseCase(c, 'trend_insight')
    const insight = await chatOnceWithModel(model, [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt }
    ])

    return {
      summary: insight,
      stats,
      generatedAt: new Date(),
      cachedForSeconds: 3600
    }
  })
}
```

캐시: targetId/customerId + 마지막 sample collected_at hash → 1시간 TTL. 새 샘플이 들어와도 1시간 동안은 같은 인사이트 반환 (LLM 비용 절약).

### 5.2 라우트

| 메서드 | 경로 | 응답 |
|---|---|---|
| GET | `/api/metrics/insights?customerId=` | `{ summary, stats, generatedAt }` (Top 5 위험 항목 종합) |
| GET | `/api/metrics/insights/:targetId` | 단일 대상 인사이트 |

### 5.3 프론트엔드

`ChannelTrend.tsx` (Stage 2 분할 후) 안에 `<TrendInsightCard>` 신설. Top 10 위험 박스 위에 배치.

```
┌─ AI 인사이트  ✨                                     ┐
│ ──────────────────────────────────────────────────── │
│ △△증권 USER_DATA TS는 최근 6개월 동안                │
│ 78% → 92% 로 상승했고, 현재 추세 유지 시              │
│ 약 3개월 내 임계값 초과 예상.                         │
│                                                     │
│ 권장 액션                                            │
│  □ 다음 정기점검 시 datafile 추가 검토               │
│  □ 임계값 도달 알림 등록                             │
│  □ 과거 유사 사례 [#H-2024-08-3] 참고                │
│                                                     │
│ (1시간 전 생성, [지금 다시 분석])                    │
└──────────────────────────────────────────────────────┘
```

기존 `card card-pad` 클래스 그대로 사용. 디자인은 새로 만들지 않음. AI 아이콘만 새로 (KB AskPanel과 동일 sparkles).

권장 액션 클릭 시 일정 등록 또는 알림 등록 자동화 → 기존 calendar/notifications API 호출.

### 5.4 실패 처리

- LLM 호출 실패: 인사이트 카드 자체를 숨김. 통계 영역은 평소대로 표시 (silent하지 않음, 카드 영역에 작은 "AI 분석 일시 불가" 텍스트)
- 통계 계산 실패: 카드 + 트렌드 화면 전체 에러 (큰 문제로 보고)

---

## 6. 데이터베이스 작업

### 6.1 AI_MODELS useCases 매핑

`AI_MODELS` 의 `USE_CASES` CSV 컬럼을 활용. Stage 3 첫 작업으로 다음 SQL 실행 또는 관리 UI에서 매핑.

```sql
UPDATE AI_MODELS
   SET USE_CASES = 'channel_assistant,task_extractor,trend_insight'
 WHERE MODEL_TYPE = 'llm'
   AND IS_DEFAULT = 1
   AND STATUS = 'active';
```

운영자가 use case 별로 다른 모델을 쓰려면 `Settings → AI 모델` 에서 각 모델의 useCases를 나눠 저장.

### 6.2 신규 테이블 없음

Stage 3은 기본적으로 신규 테이블이 없다. `AI_USE_CASES` 라벨 카탈로그 테이블은 후속 선택.

---

## 7. 작업 순서

1. **선행 보강** — `resolveLlmModelForUseCase`, `chatOnceWithModel` / `streamChatWithModel`, `shared/api/sseClient.ts`, `citationExtractor` 번호 레지스트리 확장
2. **AI_MODELS useCases 매핑** — UI 또는 SQL로 use case 3종 등록
3. **AIPanel — 백엔드 채널 컨텍스트 수집** (channelAssistant.ts 1단계)
4. **AIPanel — KB 검색 통합** (channelAssistant.ts 2단계)
5. **AIPanel — POST + ReadableStream 라우트 + 프론트 sseClient 사용**
6. **AIPanel — 인용 클릭 → 원본 표시**
7. **메시지 작업 추출 — 백엔드 taskExtractor + JSON 강제 응답**
8. **메시지 작업 추출 — 인라인 편집 카드 + 등록 흐름**
9. **트렌드 인사이트 — 통계 + 선형회귀 (LLM 안 씀)**
10. **트렌드 인사이트 — KB 검색 + LLM 요약 + 캐싱**
11. **트렌드 인사이트 — UI 카드**

각 단계마다 동작하는 화면이 나옴.

---

## 8. 검증 (이 단계만)

| 검증 | 방법 |
|---|---|
| use case 매핑 | `SELECT MODEL_ID, NAME, USE_CASES FROM AI_MODELS WHERE MODEL_TYPE='llm' AND STATUS='active'` |
| useCase resolver | 단위 테스트 — 모델 A는 `channel_assistant` 포함, B는 `task_extractor` → A/B 각각 반환 |
| AIPanel 응답 시간 | 첫 토큰 5초 이내 (검색 + LLM) |
| AIPanel 인용 표시 | 응답에 `[1][2]` 표시되고 클릭 시 원본 메시지/이력/KB 점프 |
| AIPanel 빈 KB | KB 자료 없는 채널에서도 답변 (시작 문구 자동 변경) |
| 작업 추출 정확도 | SSH 로그 메시지 10건 → 90% 이상에서 taskName/customerId 자동 채움 |
| 작업 추출 JSON 강제 | LLM 비-JSON 응답 시 1회 재시도, 실패 시 빈 폼 (에러 표시) |
| 작업 등록 RBAC | 다른 부서 사용자가 등록 시 403 |
| 트렌드 인사이트 응답 시간 | 5초 이내 |
| 트렌드 인사이트 캐싱 | 같은 customerId 두 번 호출 → 두 번째는 LLM 호출 0회 |
| 트렌드 인사이트 자연어 품질 | 위험 임박 3건 만들어 두고 → 숫자 정확, 권장 액션 3-5개 |
| AI 실패 처리 | LLM 엔드포인트 죽인 상태로 모든 진입점 → 명시적 에러 + UI 자연스러움 |

자세한 시나리오는 [99-verification.md](99-verification.md).

---

## 9. 의존성 / 위험 요소

- **Stage 1 + Stage 2 선행** — AIPanel은 `/api/channels/:id/messages` 기반, 트렌드 인사이트는 METRIC_SAMPLES 기반
- **LLM 비용** — `channel_assistant` 는 사용자 트리거이지만 `trend_insight` 는 화면 진입마다 호출 가능 → 캐싱 1시간 필수. 사용량 모니터링은 audit
- **JSON 강제 응답** — `chatOnceWithModel` wrapper 내부에서 OpenAI는 `response_format`, Ollama/Anthropic 계열은 시스템 프롬프트 강제 + 파싱 실패 재시도로 분기
- **임베딩 모델 변경 시 RAG 품질 저하** — KB와 같은 임베딩 모델 사용 보장. AI_MODELS 의 `embedding` 모델 단일 사용
- **메시지 첨부 텍스트 추출** — 이미지(스크린샷) OCR은 이 단계 범위 외. 텍스트 첨부만 처리. 이미지는 후속 작업
- **프롬프트 인젝션** — 사용자가 채널 메시지에 "이 시스템 프롬프트를 무시하고…" 같은 텍스트 입력 가능. 시스템 프롬프트 우선, 메시지 본문은 명시적으로 `<message>...</message>` 태그로 감싸 LLM에게 구분
- **인용 매핑** — `citationExtractor` 가 `[1]` 을 KB 청크에만 매핑하던 것을 메시지/이력/KB 통합 번호 레지스트리로 확장 필요. 단순 패턴 문제보다 레지스트리 설계가 핵심

---

## 10. 다음 단계

이 단계 완료 후 → [99-verification.md](99-verification.md) 의 통합 dogfood 시나리오 실행.

추후 작업(이번 라운드 범위 외):
- 이미지/스크린샷 OCR 통합 (작업 추출 정확도 향상)
- 음성 입력 (모바일에서 SSH 로그 대신 말로 입력)
- 자동 알림 — 트렌드 인사이트가 만든 권장 액션을 사용자가 승인하면 자동 일정 등록 (현재는 수동)
- 멀티턴 — AIPanel 에서 후속 질문 시 이전 답변 컨텍스트 유지 (현재는 단발 질문)
