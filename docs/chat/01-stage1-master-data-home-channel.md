# Stage 1 — 마스터 데이터 + 홈·채널 현행화

## 1. 단계 개요

지금 홈/채널 화면은 부분적으로만 실제 DB를 쓴다. `getChannels()` / `getMessages()` / `/api/home/*` 같은 핵심 API는 만들어졌지만, 사용자 · 팀 · 고객사 · 이력 · 보고서 같은 **마스터 데이터는 여전히 `window.*` 전역 mock**에 의존한다. 이 단계는 그 잔존 mock을 끝까지 걷어내 화면이 전부 실제 DB에서 나오도록 만든다.

**산출물**: 기존 마스터 API 정리 · 누락 옵션 추가 + `window.*` 업무 mock 직접 참조 0건 + 홈·채널 화면이 실제 데이터로 완전 동작.

UI 디자인은 손대지 않는다. 데이터 prop 형태와 호출만 바꾼다.

이 단계의 본질은 "API 신규 7종 추가"가 아니라 **이미 존재하는 vertical slice를 프론트 홈/채널 화면에 연결하고 mock fallback을 제거하는 작업**이다. 신규 추가가 필요한 라우트는 (있다면) 검색 옵션 · 경량 응답 · 고객사 채널용 보고서 조인 정도다.

---

## 2. 기존 API 매핑

| 영역 | 기존 라우트 (앱 마운트 기준) | Stage 1 처리 |
|---|---|---|
| 인증 | `POST /api/auth/login` (`username`, `password`), `GET /api/auth/me`, `POST /api/auth/logout` | 신규 추가 0건. `UserContext` 로 응답 필드만 정규화 |
| 부서/팀 | `GET /api/org/departments`, `GET /api/org/users`, `GET /api/org/positions` | 기존 그대로. **팀 = 부서**(DEPARTMENTS) |
| 고객사 | `GET /api/customers` | 검색용 `q`, `limit`, 담당자 필터 옵션 추가 |
| 채널/메시지 | `GET /api/channels?kind=`, `GET /api/channels/:id/messages` | 기존 그대로. DM kind 도 같은 라우트 처리 |
| 지원이력 | `GET /api/support-history?customerId=&engineerId=&from=&to=` (camelCase) | query 명칭을 camelCase로 통일 |
| 주간보고 | `GET /api/weekly-reports?weekStart=&teamId=` (`teamId` 는 실제 dept_id) | 팀 보고서는 그대로. 고객사 채널 보고서는 별도 조인 endpoint 신설 |
| 서비스 마스터 | `GET /api/service-master` (단수 마운트, 모듈 폴더는 복수형) | 경로 그대로 유지 권장. 복수형 alias가 필요하면 별도 결정 |
| 홈 | `GET /api/home/summary`, `/today-events`, `/recent-history` | 기존 그대로 |

`/api/auth/me` · `/api/customers` · `/api/support-history` · `/api/weekly-reports` · `/api/service-master` · `/api/channels` · `/api/home` 모두 이미 존재한다. Stage 1에서 새로 라우트를 만들 영역은 다음 정도다.

| 신규 또는 확장 항목 | 위치 | 사유 |
|---|---|---|
| `GET /api/customers?q=&limit=` 검색 옵션 | customers 모듈 | 멘션·콤보박스용 경량 응답 |
| `GET /api/customers/:id/frequency` (선택) | customers 또는 routine-plans | window.FREQ_BY_ID 대체. Stage 2에서 metrics 기반으로 재정렬할 수 있음 |
| 고객사 채널 보고서 조인 endpoint (선택) | weekly-report | `WEEKLY_REPORT_ITEMS + SUPPORT_HISTORIES` 조인. 팀 주간보고만으로 충분하면 생략 |

---

## 3. 잔존 mock 위치

다음은 구현 시작 시 `rg` 로 재측정해 확정한다. 코드는 빠르게 변하므로 표는 후보 목록일 뿐이다.

| 변수 / 함수 | 사용 파일 (실측 필요) | 대체 방법 |
|---|---|---|
| `window.ME` | `app.tsx`, `Workspace.tsx`, `TopBar.tsx`, `Sidebar.tsx` 등 | `GET /api/auth/me` → UserContext |
| `window.TEAMS`, `window.MY_TEAM` | sidebar/department channel 계열 | `GET /api/org/departments` → MasterDataContext |
| `window.CUSTOMERS`, `window.MY_CUSTOMERS` | 사이드바, 멘션·검색 드롭다운 | `GET /api/customers?q=&limit=` |
| `window.HISTORY`, `window.SUPPORT_HISTORIES` | `Workspace.tsx`, CommandK | `GET /api/support-history?customerId=` |
| `window.SERVICE_TEMPLATES` | `Message.tsx:39` (메시지 본문 하이라이트) | `GET /api/service-master` |
| `window.FREQ_BY_ID` | `ChannelTrend.tsx:36` | Stage 2 metrics에서 자연 해소 또는 위 신규 endpoint |
| `window.ENGINEERS` | 구현 시 재측정 | `GET /api/org/users?deptId=` |
| `window.POSITIONS` | 구현 시 재측정 | `GET /api/org/positions` |
| `window.DIRECT_MESSAGES`, `window.TEAM_CHANNELS`, `window.MY_TEAM_CHANNELS`, `window.GROUP_TAGS`, `window.PROJECTS` | sidebar 계열 추정 | `GET /api/channels` 응답으로 흡수 |
| `buildDMMessages()` | `Conversation.tsx:36-39` | DM kind 를 `/api/channels/:id/messages` 가 처리 |
| `buildMasterServiceReports()` | `ChannelReports.tsx:73` | 위 고객사 채널 보고서 조인 endpoint |
| `getHistoryParticipants()` | `ChannelHistory.tsx:9` | API 응답에 `participants[]` 포함 시 자동 해소 |
| `service.monthly` (가짜) | `ChannelTrend.tsx:388-421` | **Stage 2 범위** — 이 단계 작업 아님 |

업무 mock 재측정 명령:

```powershell
rg -n "window\.(ME|TEAMS|MY_TEAM|CUSTOMERS|MY_CUSTOMERS|HISTORY|SUPPORT_HISTORIES|SERVICE_TEMPLATES|FREQ_BY_ID|ENGINEERS|POSITIONS|DIRECT_MESSAGES|TEAM_CHANNELS|MY_TEAM_CHANNELS|GROUP_TAGS|PROJECTS)" frontend/src
```

브라우저 표준 API(`window.location`, `window.confirm`, `localStorage`, 이벤트 리스너 등)는 제거 대상이 아니다.

---

## 4. 프론트엔드 작업

### 4.1 신규 파일

```
frontend/src/api/
  userApi.ts          getMe()                        — /api/auth/me 래퍼
  deptApi.ts          listDepartments()              — /api/org/departments
  userListApi.ts      listUsers({ deptId, role })    — /api/org/users
  customerApi.ts      searchCustomers({ q, limit })  — /api/customers
                      getFrequency(customerId)        — 선택 endpoint
  historyApi.ts       listHistories(filter)          — /api/support-history (camelCase)
  serviceMasterApi.ts listServiceMasters()           — /api/service-master
  reportApi.ts        listTeamReports({ weekStart, teamId })  — /api/weekly-reports
                      listCustomerReports(customerId)         — 신규 조인 endpoint(있다면)

frontend/src/context/
  UserContext.tsx        — /api/auth/me 결과 보관, 401 시 로그인 라우트로
  MasterDataContext.tsx  — departments + customers + service-master 캐시
```

이미 있는 `messagingApi.ts`, `homeApi.ts` 는 그대로 둔다.

### 4.2 부팅 흐름

`frontend/src/app.tsx` 변경:

```
1. <UserProvider>          ← /api/auth/me 호출. 미인증이면 로그인 라우트
2.   <MasterDataProvider>  ← departments, customers(경량), service-master 병렬 호출
3.     <App />             ← 기존 라우팅 그대로
```

기존 `data.ts` / `data2.js` 는 import 0건이 되면 삭제한다.

### 4.3 영향 파일별 수정

| 파일 | 수정 내용 |
|---|---|
| `components/features/home/HomeInbox.tsx:114` | `(window as any).ME` → `useUser()` |
| `components/Workspace.tsx:54-58` | `window.ME / MY_TEAM / HISTORY` → context + `useHistory()` 훅 |
| `features/messaging/parts/Conversation.tsx:36-39` | `buildDMMessages()` 제거 → `getMessages(channelId)` 일원화 |
| `features/messaging/parts/Message.tsx:39` | `window.SERVICE_TEMPLATES` → `useMasterData().serviceMasters` |
| `features/messaging/parts/ChannelHistory.tsx:9` | `getHistoryParticipants` 로컬 헬퍼 → API 응답의 `participants[]` |
| `features/messaging/parts/ChannelReports.tsx:73` | `buildMasterServiceReports()` → `listTeamReports()` 또는 `listCustomerReports()` |
| `features/messaging/parts/ChannelTrend.tsx:35-36` | `window.TEAMS` → MasterDataContext, `window.FREQ_BY_ID` 는 Stage 2 작업과 함께 |
| 기타 `window.*` 직접 참조 파일들 | 일괄 교체 (`rg` 결과로 정확한 파일 식별 후) |

JSX, CSS, 인라인 스타일은 절대 변경 금지.

### 4.4 권한(RBAC) 처리

`UserContext` 가 보유한 `rbacRoleId` / `rbacRoleLabel` 을 기반으로 다음이 분기된다.

- 홈: 본인이 속한 부서/담당 고객사만 표시
- 채널 목록: 멤버 채널만
- 지원이력: 본인 작성 또는 부서장 권한이면 부서 전체
- 트렌드: 본인이 담당하는 고객사만

`http/rbac.ts` 가 이미 미들웨어로 작동 중이다. 응답 자체가 권한 필터된 결과를 반환하므로 프론트는 추가 분기를 거의 하지 않는다.

---

## 5. 백엔드 작업

### 5.1 모듈별 변경

| 모듈 | 작업 |
|---|---|
| `auth` | 라우트 신규 X. 응답 필드 정규화 검토(현재 `{id, username, name, department, position, rbacRoleId, rbacRoleLabel, ...}`) |
| `organization` | 라우트 신규 X. 정렬·필터 옵션 누락 시 보강 |
| `customers` | 검색용 `q`, `limit`, `assignedUserId` 옵션 추가. 기존 풀 페이지 응답과 분리 |
| `support-history` | query를 camelCase로 통일. 페이징/정렬 보강 |
| `messaging` | DM kind 가 동일 라우트로 처리되는지 검증. 분기 있으면 제거 |
| `weekly-report` | 고객사 채널용 보고서 조회가 필요하면 별도 endpoint 추가. 팀 주간보고만으로 충분하면 생략 |
| `settings/service-masters` | 마운트 경로 결정(`/api/service-master` 단수 유지 권장). 응답 형태 정리 |

모두 raw SQL + envelope 응답. 기존 모듈 패턴 그대로 따른다.

### 5.2 신규 테이블 없음

Stage 1에서는 신규 테이블이 없다. USERS · DEPARTMENTS · CUSTOMERS · SUPPORT_HISTORIES · CHANNELS · MESSAGES · SERVICE_MASTERS · WEEKLY_REPORTS 모두 활용.

`TEAMS` 테이블은 도입하지 않는다. `WEEKLY_REPORTS.TEAM_ID` 도 실제로는 `DEPARTMENTS.DEPT_ID` FK이다. 별도 팀 개념이 제품 결정으로 명확해질 때만 ADR + DDL로 분리한다.

---

## 6. 작업 순서

1. **마스터 API 옵션 보강** — `customers ?q=`, `support-history` camelCase, 필요 시 고객사 보고서 endpoint
2. **프론트엔드 Context 도입** — UserContext + MasterDataContext, app.tsx 부팅 흐름 변경
3. **api/ 신규 클라이언트 6-7종 추가** — 단순 fetch 래퍼
4. **`window.*` 직접 참조 일괄 교체** — 한 PR로 묶어 재현 가능. 디자인 변경 0건 검증
5. **DM 메시지 통합** — `buildDMMessages()` 제거, `Conversation.tsx` 단순화
6. **보고서 목록 연동** — `ChannelReports.tsx` 실제 API 응답 표시
7. **dead code 삭제** — `data.ts`, `data2.js`, mock builder 함수

각 단계마다 화면이 동작해야 한다. 도중에 화면이 깨지면 즉시 롤백.

---

## 7. 검증 (이 단계만)

| 검증 | 방법 |
|---|---|
| 업무 mock 0건 | 위 PowerShell `rg` 명령 결과 0 매치 |
| data.ts/data2.js 미사용 | `rg "from ['\"].*data2?(\.[jt]sx?)?['\"]" frontend/src` → 0 매치 |
| /api/auth/me | curl → JWT 헤더 동반 시 200 + 본인 정보 (username 기반 로그인) |
| 홈 4탭 | 멘션/미읽음/즐겨찾기/최근활동 각각 실제 데이터 |
| DM 채널 | 클릭 → 실제 메시지 + 작성·답장 가능 |
| 권한 검증 | 다른 권한 사용자로 로그인 → 보이는 채널/이력이 다른지 |
| UI 디자인 회귀 | 스크린샷 diff 0건 (Phase 0 mockup과 비교) |

자세한 시나리오는 [99-verification.md](99-verification.md).

---

## 8. 의존성 / 위험 요소

- **Stage 2의 ChannelTrend 일반화는 이 단계와 부분 결합** — `window.FREQ_BY_ID` 제거는 Stage 1, 트렌드 데이터 자체 일반화는 Stage 2. 이 단계에서 ChannelTrend 에 임시로 빈 배열을 주거나, Stage 2를 함께 진행
- **17개 파일 일괄 교체 리스크** — Context 를 잘못 wrapping 하면 전체 화면이 한 번에 깨진다. 단계적 교체 + 매 PR 마다 dev 서버 확인
- **권한 필터 누락** — RBAC 미들웨어가 빠진 신규/확장 라우트가 있으면 다른 사용자 데이터 노출. 모든 라우트에 `requireAuth` + `requireRole` 적용 확인
- **`/api/service-master` 경로 결정 보류** — 단수형 마운트와 복수형 모듈 폴더 불일치. 본 단계에서는 단수형 유지를 권장하되, 별도 ADR로 결정해 두는 것도 가능

---

## 9. 다음 단계

이 단계 완료 후 → [02-stage2-trend-generalization.md](02-stage2-trend-generalization.md) 로 진행.
