# 검증 계획 — 단계별 시나리오 + 통합 Dogfood

## 1. 검증 원칙

- **각 단계는 독립적으로 검증** — Stage 1만 끝나도 화면이 정상 동작해야 함
- **회귀 우선** — 새 기능보다 기존 기능이 깨지지 않는지를 더 자주 확인
- **UI 디자인 회귀** — 스크린샷 비교가 기본. 픽셀 차이 없음 확인
- **Silent failure 금지** — AI 실패 / DB 실패 / 네트워크 실패 모두 명시적 에러 표시
- **각 검증은 자동화 가능 형태** — 가능하면 PowerShell 명령 / `rg` / SQL 로 표현

작업 환경은 Windows / PowerShell. bash 예시는 Git Bash 또는 WSL 에서만 그대로 동작한다. 본 문서는 PowerShell 기준을 우선한다.

---

## 2. Stage 1 검증 — 마스터 데이터 + 홈/채널

### 2.1 자동 점검

```powershell
# 업무 mock 0건 (PowerShell + rg)
rg -n "window\.(ME|TEAMS|MY_TEAM|CUSTOMERS|MY_CUSTOMERS|HISTORY|SUPPORT_HISTORIES|SERVICE_TEMPLATES|FREQ_BY_ID|ENGINEERS|POSITIONS|DIRECT_MESSAGES|TEAM_CHANNELS|MY_TEAM_CHANNELS|GROUP_TAGS|PROJECTS)" frontend/src
# → 0 매치

# data.ts/data2.js import 0건
rg -n "from ['""].*data2?(\.[jt]sx?)?['""]|import\(['""].*data2?(\.[jt]sx?)?['""]\)" frontend/src
# → 0 매치

# buildDMMessages, buildMasterServiceReports 정의 + 호출 0건
rg -n "build(DMMessages|MasterServiceReports)" frontend/src
# → 0 매치 (정의·호출 모두 삭제 확인)
```

### 2.2 API 점검

```bash
# 인증 (username 기반)
TOKEN=$(curl -s http://127.0.0.1:7001/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"username":"engineer1","password":"<pwd>"}' | jq -r '.data.token')

# 본인 정보
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:7001/api/auth/me `
  | jq '.data | {id, username, name, department, position, rbacRoleId}'
# → null 없는 객체

# 부서 (팀 = 부서)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:7001/api/org/departments `
  | jq '.data | length'
# → 1 이상

# 고객사 검색 (Stage 1 신규 옵션)
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:7001/api/customers?q=증권&limit=20" `
  | jq '.data[] | .name'
# → "증권" 포함 결과

# 지원이력 (camelCase query)
curl -s -H "Authorization: Bearer $TOKEN" `
  "http://127.0.0.1:7001/api/support-history?customerId=1&from=2026-01-01&to=2026-12-31" `
  | jq '.data | length'

# 팀 주간보고 (teamId 는 실제 dept_id)
curl -s -H "Authorization: Bearer $TOKEN" `
  "http://127.0.0.1:7001/api/weekly-reports?teamId=1&weekStart=2026-05-04" `
  | jq '.data | length'
```

(PowerShell 에서는 `curl` 이 `Invoke-WebRequest` alias 다. `curl.exe` 명시 또는 `Invoke-RestMethod` 사용. `\` 줄바꿈 대신 `` ` `` 사용)

### 2.3 UI 점검

| 화면 | 시나리오 |
|---|---|
| 부팅 | 새 탭에서 페이지 로드 → 로그인 → 홈 화면 표시 → "안녕하세요, ○○○님 👋" 본인 이름 |
| 홈 - 멘션 탭 | 멘션된 채널만 표시. 미멘션 채널은 안 보임 |
| 홈 - 미읽음 탭 | unread > 0 채널만 |
| 홈 - 즐겨찾기 탭 | starred=true 채널만 |
| 채널 진입 - 팀 채널 | 메시지 목록 실제 DB |
| 채널 진입 - 고객사 채널 | 메시지 + 지원이력 + 보고서 모두 실제 DB |
| 채널 진입 - DM | 메시지 정상 표시 (buildDMMessages 결과 아님) |
| 메시지 - 서비스명 하이라이트 | "Oracle 19c" 등 service master에 등록된 단어 자동 강조 |
| 권한 검증 | 권한 없는 사용자로 다른 부서 채널 접근 시도 → 안 보임 또는 403 |
| 디자인 회귀 | Phase 0 mockup 스크린샷과 비교 → 차이 없음 |

### 2.4 통합 시나리오

```
1. 로그인 (engineer1, username 기반)
2. 홈 → 멘션 탭에 △△증권 채널 보임 (멘션 1건)
3. 채널 진입
4. 메시지 목록 표시 (10건 이상)
5. 헤더에 "△△증권" + 담당자 색상 표시
6. 우측 사이드: 지원이력 5건 (실제 DB)
7. 보고서 탭 클릭 → 주간보고 목록 (실제 DB)
8. 트렌드 탭 클릭 → ChannelTrend 표시 (Stage 2까지 mock 가능)
9. 다른 사용자(engineer2)로 로그인 → 같은 채널 접근 → 권한 따라 다른 결과
```

---

## 3. Stage 2 검증 — 트렌드 일반화

### 3.1 자동 점검

```powershell
# 미사용 컴포넌트 삭제 확인
if (-not (Test-Path frontend/src/components/ChannelTrend.tsx)) { "OK" }

# 500줄 한도
Get-ChildItem frontend/src/features/messaging/parts -Recurse -Filter *.tsx |
  ForEach-Object {
    $count = (Get-Content $_.FullName).Count
    if ($count -gt 500) { "$count $($_.FullName)" }
  }
# → 0 매치
```

### 3.2 DDL 점검

```sql
-- 필수 4개 테이블
SELECT table_name FROM USER_TABLES
 WHERE table_name IN ('METRIC_DEFINITIONS', 'MONITOR_TARGETS',
                      'METRIC_SAMPLES', 'TARGET_METRIC_OVERRIDES');
-- → 4건

-- Stage 2-2 까지 포함한 경우만
SELECT table_name FROM USER_TABLES
 WHERE table_name = 'METRIC_AGGREGATES';
-- → 선택 1건

-- METRIC_SAMPLES 파티션 확인
SELECT partition_name, high_value
  FROM USER_TAB_PARTITIONS
 WHERE table_name = 'METRIC_SAMPLES'
 ORDER BY partition_position;
-- → INTERVAL 파티션 자동 생성 확인 (월별)

-- 인덱스 확인
SELECT index_name, partitioned
  FROM USER_INDEXES
 WHERE table_name = 'METRIC_SAMPLES';
-- → idx_samples_target_time, idx_samples_metric_time (LOCAL)

-- enabled 컬럼 일관성 (NUMBER(1) DEFAULT 1)
SELECT data_type, data_length, default_length
  FROM USER_TAB_COLUMNS
 WHERE table_name = 'METRIC_DEFINITIONS' AND column_name = 'ENABLED';
-- → NUMBER, length 22

-- 시드 메트릭 50개+
SELECT system_type, COUNT(*) FROM METRIC_DEFINITIONS
 WHERE enabled = 1 GROUP BY system_type;
-- → oracle, mysql, redis, linux 등 다수
```

### 3.3 API 점검

```bash
# 메트릭 정의
curl -s -H "Authorization: Bearer $TOKEN" `
  "http://127.0.0.1:7001/api/metrics/definitions?systemType=mysql" `
  | jq '.data | length'
# → 5 이상 (MySQL 메트릭들)

# 모니터링 대상 추가 (NUMBER FK)
curl -s -X POST -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  http://127.0.0.1:7001/api/metrics/targets `
  -d '{
    "name": "△△증권 운영DB",
    "systemType": "oracle",
    "customerId": 1,
    "deptId": 1,
    "hostname": "prd-ora01",
    "serviceMasterId": "oracle19c"
  }'
# → 201 + { targetId: <number> }

# 수동 입력 (12개월치)
$TARGET_ID = "<위에서 받은 number>"
1..12 | ForEach-Object {
  $m = $_
  $body = @{
    targetId    = $TARGET_ID
    metricId    = "oracle.tablespace.usage"
    value       = 50 + $m * 4
    collectedAt = "2026-{0:D2}-15T10:00:00" -f $m
    sourceRef   = "R-2026-$m-1"
  } | ConvertTo-Json
  curl.exe -s -X POST -H "Authorization: Bearer $TOKEN" `
    -H "Content-Type: application/json" `
    http://127.0.0.1:7001/api/metrics/manual `
    -d $body
}

# 시계열 조회
curl -s -H "Authorization: Bearer $TOKEN" `
  "http://127.0.0.1:7001/api/metrics/samples?targetId=$TARGET_ID&metricId=oracle.tablespace.usage&from=2026-01-01&to=2026-12-31&agg=raw" `
  | jq '.data | length'
# → 12

# Ingest 배치 (env 토큰)
curl -s -X POST -H "Authorization: Bearer $env:METRIC_INGEST_TOKEN" `
  -H "Content-Type: application/json" `
  http://127.0.0.1:7001/api/metrics/ingest `
  -d '{
    "samples": [
      {"targetId":1,"metricId":"linux.cpu.load_avg_5m","value":2.1,"collectedAt":"2026-05-07T10:00:00"},
      {"targetId":1,"metricId":"linux.memory.usage","value":67,"collectedAt":"2026-05-07T10:00:00"}
    ]
  }'
# → 200, 초기 목표 3초 이내

# 위험 Top
curl -s -H "Authorization: Bearer $TOKEN" `
  "http://127.0.0.1:7001/api/metrics/risk?customerId=1" `
  | jq '.data[] | {target: .targetName, metric: .metricName, value, status}'
```

### 3.4 UI 점검

| 화면 | 시나리오 |
|---|---|
| 트렌드 화면 진입 | KPI 카드(임계 초과/주의/예상 포화/검토) 실제 DB 값 |
| 시스템 종류 필터 | "MySQL" 클릭 → Oracle 메트릭 사라짐, MySQL만 |
| Top 10 위험 | 위험도 순 정렬, 클릭 시 차트 영역 변경 |
| 12개월 차트 | 월별 점 12개, 선 연결, 임계값 점선 |
| 히트맵 | 서비스별 행, 메트릭별 셀, 색깔 정상 (ok 회색, warn 주황, crit 빨강) |
| 상세표 | 정렬, 필터, CSV 내보내기 |
| 임계값 오버라이드 | 특정 고객사 USER_DATA TS 70/85로 변경 → 다른 고객사는 그대로, 그 고객사만 색깔 다름 |
| 디자인 회귀 | Stage 1 완료 시점 스크린샷과 비교 |

### 3.5 통합 시나리오

```
1. 관리설정 → 모니터링 대상 → "추가"
2. △△증권 운영DB (Oracle) 등록 (customerId=1, deptId=1)
3. 메트릭 정의 확인 → Oracle용 6개 메트릭 자동 후보
4. 수동 입력 화면 → USER_DATA TS 사용률 12개월치 입력 (50% → 92% 상승)
5. 채널 진입 → 트렌드 탭 클릭
6. AI 인사이트 카드 (Stage 3 후) — 위험 메시지 표시
7. Top 10 에 △△증권 USER_DATA TS 1위
8. 차트 클릭 → 12개월 라인차트 우상향
9. 시스템 종류 필터 "MySQL" 클릭 → 사라짐 → "Oracle"로 복귀 확인
10. 같은 고객사에 Linux 서버 대상 추가 → /var 디스크 메트릭 입력 → Oracle/Linux 함께 보임
```

---

## 4. Stage 3 검증 — AI 연결

### 4.1 자동 점검

```sql
-- AI_MODELS useCases 매핑 확인
SELECT MODEL_ID, NAME, PROVIDER, MODEL_TYPE, STATUS, USE_CASES, IS_DEFAULT
  FROM AI_MODELS
 WHERE MODEL_TYPE = 'llm'
   AND STATUS = 'active'
   AND (
     USE_CASES LIKE '%channel_assistant%'
     OR USE_CASES LIKE '%task_extractor%'
     OR USE_CASES LIKE '%trend_insight%'
   );
-- → 1건 이상 (3 use case 매핑 충족)

-- 각 use case 별로 매핑된 모델이 있는지
SELECT 'channel_assistant' AS use_case,
       COUNT(*) AS matched
  FROM AI_MODELS
 WHERE STATUS='active' AND USE_CASES LIKE '%channel_assistant%'
UNION ALL
SELECT 'task_extractor', COUNT(*) FROM AI_MODELS
 WHERE STATUS='active' AND USE_CASES LIKE '%task_extractor%'
UNION ALL
SELECT 'trend_insight', COUNT(*) FROM AI_MODELS
 WHERE STATUS='active' AND USE_CASES LIKE '%trend_insight%';
-- → 각 1 이상
```

### 4.2 API 점검

```bash
# AIPanel 질문 (POST + ReadableStream)
curl.exe -N -H "Authorization: Bearer $TOKEN" `
  -X POST http://127.0.0.1:7001/api/channels/CH001/assistant/ask `
  -H "Content-Type: application/json" `
  -d '{"question":"지난주 △△증권 점검 요약해줘"}'
# → event: token / event: citation / event: done 스트림 출력

# 작업 추출 (channels 라우터 하위)
curl -s -X POST -H "Authorization: Bearer $TOKEN" `
  http://127.0.0.1:7001/api/channels/CH001/messages/M-001/extract-task `
  | jq '.data.extracted'
# → JSON 객체 (taskName, customerId, priority, ...)

# 트렌드 인사이트
curl -s -H "Authorization: Bearer $TOKEN" `
  "http://127.0.0.1:7001/api/metrics/insights?customerId=1" `
  | jq '{ summary: .data.summary[0:200], actionCount: (.data.recommendedActions | length) }'
# → 한국어 요약 + 권장 액션 3-5개
```

### 4.3 UI 점검

| 기능 | 시나리오 |
|---|---|
| AIPanel 진입 | 자동 요약 5초 이내 첫 토큰 |
| AIPanel 질문 | 입력 → Enter → 토큰 스트리밍 표시 |
| AIPanel 인용 | `[1]` 클릭 → 원본 메시지 패널 표시 |
| AIPanel 빈 KB | KB 0건 채널에서도 답변 (시작 문구 자연스러움) |
| AIPanel 실패 | LLM 엔드포인트 죽이고 → 명시적 에러 표시 |
| 메시지 추출 | SSH 로그 메시지 호버 → "작업카드 변환" 버튼 → 추출 카드 표시 |
| 추출 신뢰도 | 신뢰도 90%+ 시 자동 채워진 필드, 낮으면 빨간 강조 |
| 추출 등록 | "지원이력으로 등록" 클릭 → support-history 1건 생성 + audit 기록 |
| 추출 RBAC | 다른 부서 사용자 등록 시도 → 403 |
| 트렌드 인사이트 | 위험 임박 3건 만들어 두고 → 5초 이내 자연어 카드 표시 |
| 트렌드 인사이트 캐싱 | 같은 customerId 두 번 호출 → 두 번째 즉시 (LLM 호출 0) |
| 트렌드 인사이트 실패 | LLM 죽이고 → 카드 자체 숨김, 작은 "AI 분석 일시 불가" |

### 4.4 통합 시나리오 (AI EUREKA dogfood)

```
1. 엔지니어 모바일에서 △△증권 채널 진입
2. 메시지 입력창에 SSH 로그 붙여넣기:
   ```
   SQL> SELECT tablespace_name, used_percent FROM dba_tablespace_usage_metrics;
   USER_DATA  92.4
   SYSAUX     67.1
   UNDO       54.3
   ```
3. 메시지 등록 (전송)
4. 메시지 호버 → "작업카드 변환" 버튼 클릭
5. 슬라이드 패널 표시:
   - 작업명: "USER_DATA 테이블스페이스 확장"
   - 고객사: △△증권 (customerId=1, 자동)
   - 분류: routine
   - 우선순위: high
   - 예상소요: 60분
   - 후속조치: "datafile 추가 검토", "임계값 알림 등록"
6. 신뢰도 88% 표시
7. 일부 필드 인라인 수정
8. "지원이력으로 등록" 클릭 → 등록 완료
9. 채널 헤더의 지원이력 카운트 +1
10. 매트릭스 화면에서 해당 셀 done 표시
11. 트렌드 화면 → AI 인사이트 카드: "USER_DATA TS 92% 도달, 3개월 내 임계값 예상"
12. AIPanel 열어서 "△△증권 USER_DATA TS 위험한지" 질문
13. AI 답변: "현재 92%, [1] 인용으로 방금 등록한 작업 표시"
14. [1] 클릭 → 방금 등록한 지원이력으로 점프
```

이 한 시나리오가 통과하면 EUREKA 핵심 기능이 끝-끝 동작.

---

## 5. 통합 회귀 (전체 끝나고)

### 5.1 자동

```powershell
# 업무 mock 0건 (Stage 1)
rg -n "window\.(ME|TEAMS|MY_TEAM|CUSTOMERS|MY_CUSTOMERS|HISTORY|SUPPORT_HISTORIES|SERVICE_TEMPLATES|FREQ_BY_ID|ENGINEERS|POSITIONS|DIRECT_MESSAGES|TEAM_CHANNELS|MY_TEAM_CHANNELS|GROUP_TAGS|PROJECTS)" frontend/src
# → 0

# 500줄 한도
Get-ChildItem frontend/src,backend/src -Recurse -Include *.tsx,*.ts |
  ForEach-Object {
    $c = (Get-Content $_.FullName).Count
    if ($c -gt 500) { "$c $($_.FullName)" }
  }
# → 0

# 모듈 헤더 누락 (신규 파일)
Get-ChildItem backend/src/modules/metrics -Recurse -Include *.ts |
  Where-Object { -not ((Get-Content $_.FullName -Raw) -match '@module|파일:') } |
  Select-Object FullName
# → 0

# 미사용 dead code
Test-Path frontend/src/components/ChannelTrend.tsx   # → False
Test-Path frontend/src/data.ts                       # → False
Test-Path frontend/src/data2.js                      # → False
```

### 5.2 권한 회귀

```
사용자 4명 시나리오:
- engineer1 (개발팀) — 본인 채널 + △△증권 담당
- engineer2 (개발팀) — 본인 채널 + ○○생명 담당
- manager1 (개발팀장) — 부서 전체 보임
- admin1 — 전체 시스템

각 사용자로 로그인하여:
1. 홈 채널 목록 차이
2. 트렌드 화면 고객사 목록 차이
3. AIPanel 답변 인용 가능 범위 차이
4. 작업 추출 등록 권한 차이
5. 모니터링 대상 추가 권한 차이 (manager+ only)
6. 메트릭 정의 추가 권한 차이 (admin only)
```

### 5.3 성능 회귀

```
- 홈 화면 부팅 → First Paint < 1초
- 채널 진입 → 메시지 표시 < 500ms
- 트렌드 화면 진입 → 차트 표시 < 2초
- AIPanel 첫 토큰 < 5초
- 작업 추출 < 8초
- Ingest 1000건 배치 < 3초 (초기 목표) → 1초 (최적화 후)
- 트렌드 인사이트 첫 요청 < 5초, 캐시 히트 < 200ms
```

### 5.4 디자인 회귀

```
다음 화면 각각 Phase 0 mockup과 픽셀 비교:
- 홈 (각 4탭)
- 채널 (메시지/이력/보고서/트렌드 4탭)
- AIPanel
- 트렌드 (KPI/Top10/차트/히트맵/상세표)
- 모니터링 대상 관리

차이 발견 시 즉시 이슈 등록 + 수정.
```

---

## 6. 운영 단계 모니터링 항목

배포 후 1주일 모니터링:

| 항목 | 임계값 | 대응 |
|---|---|---|
| `/api/auth/me` 4xx 비율 | < 1% | 인증 로직 점검 |
| AIPanel 평균 첫 토큰 시간 | < 5초 | LLM 모델 변경 또는 검색 topK 축소 |
| 작업 추출 신뢰도 50% 미만 비율 | < 20% | 시스템 프롬프트 개선 |
| Ingest 5xx 비율 | < 0.5% | 트랜잭션 로그 확인 |
| 트렌드 인사이트 캐시 히트율 | > 80% | 캐시 TTL 조정 |
| METRIC_SAMPLES 일일 증가량 | 예상 ± 30% | 수집 Agent 점검 |

대시보드: 별도 작업 — 이번 라운드 범위 외.

---

## 7. 산출물 점검 체크리스트

```
[ ] docs/chat/00-architecture.md 작성
[ ] docs/chat/01-stage1-master-data-home-channel.md 작성
[ ] docs/chat/02-stage2-trend-generalization.md 작성
[ ] docs/chat/03-stage3-ai-integration.md 작성
[ ] docs/chat/04-critical-review.md 유지/갱신
[ ] docs/chat/99-verification.md 작성 (이 문서)

[ ] docs/README.md 인덱스에 chat 진입점 등록
[ ] 관련 ADR 필요 시 추가
    - adr/0005-multi-system-metrics-model.md (Stage 2 결정 근거)
    - adr/0006-channel-ai-via-kb-rag.md (Stage 3 결정 근거)
```

---

## 8. 관련 문서

- [00-architecture.md](00-architecture.md) — 전체 아키텍처
- [01-stage1-master-data-home-channel.md](01-stage1-master-data-home-channel.md) — Stage 1
- [02-stage2-trend-generalization.md](02-stage2-trend-generalization.md) — Stage 2
- [03-stage3-ai-integration.md](03-stage3-ai-integration.md) — Stage 3
- [04-critical-review.md](04-critical-review.md) — 구현 전 체크리스트
- [../architecture/overview.md](../architecture/overview.md) — 시스템 전체 그림
- [../runbooks/oracle-troubleshooting.md](../runbooks/oracle-troubleshooting.md) — 운영 시 Oracle 이슈 대응
