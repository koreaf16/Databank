# DataBank Slack 시스템 현행화 계획

## Context — 왜 이 작업을 하는가

DataBank Slack(`C:\Dev\Databank`)은 사내 업무 통합 플랫폼이다. 9개 메뉴의 UI는 이미 만들어져 있지만, 실제 Oracle DB와 연동된 도메인은 **조직도(부서/사용자)**, **고객사**, **보고서 마스터 템플릿** 3개뿐이고 나머지는 `mockData.js` / `attendanceMock.js` / `server.js` 인메모리 변수 / `frontend/src/data.js`의 `window.*` 글로벌(28개+)에 의존한다. 또한 단일 파일 비대화가 심각해 운영·유지보수가 어렵다(`Pages.jsx` 2460줄, `Workspace.jsx` 약 3759줄, `Settings2.jsx` 1423줄). docs 폴더는 존재하지 않는다.

**목표**: (1) 모든 메뉴를 Oracle 기반으로 현행화, (2) 모든 도메인의 REST API 표준화, (3) 디렉토리/파일을 기능별·깊이별로 분리하여 500줄 한도 준수, (4) 모든 코드에 한국어 헤더 주석(역할·연관 파일) 부착, (5) `docs/architecture/` 와 `docs/modules/<메뉴>/` 아래 시스템 기술서 신규 작성.

**사용자가 결정한 사항**:
- 진행 단위: Phase 0(공통 기반) → Phase 1(메뉴별 수직 완성) → Phase 2(마무리)
- 데이터 마이그레이션: **빈 테이블 + UI 입력**(mockData를 seed로 옮기지 않음)
- Pages.jsx 분리: **공통 기반 단계에서 9개로 선행 분리** 후 메뉴 작업
- 메뉴별 기술서: `docs/modules/<도메인>/` 아래 전부 신규 생성
- **UI 디자인 불변 원칙**: 기존 목업 기반 UI 디자인(레이아웃·색상·컴포넌트 구조)은 현행화 작업 중 변경 금지. 파일 분리 시 JSX/CSS 원본 유지, 데이터 연결(window.* → API 훅)만 교체. 디자인 변경이 필요하면 반드시 사용자 확인 후 진행.

---

## 사전 진단 (실측)

| 항목 | 현황 |
|---|---|
| 백엔드 진입점 | [backend/src/server.js](backend/src/server.js) (1063줄, 9개 도메인 혼재) |
| Oracle 래퍼 | [backend/src/oracle.js](backend/src/oracle.js) (`withOracleConnection`) |
| DB 연동 완료 | DEPARTMENTS, USERS, CUSTOMERS, CUSTOMER_ALIASES, REPORT_MASTER_TEMPLATES |
| Mock 잔존 | [backend/src/mockData.js](backend/src/mockData.js), [backend/src/attendanceMock.js](backend/src/attendanceMock.js), `server.js`의 `kbCategories/kbDocuments` 인메모리 |
| 프론트 진입 | [frontend/src/app.jsx](frontend/src/app.jsx) (244줄) |
| 거대 파일 | [frontend/src/components/Pages.jsx](frontend/src/components/Pages.jsx) (2460줄), `Workspace.jsx` (약 3759줄), `Settings2.jsx` (1423줄), `Settings.jsx` (841줄), `ReportMasterTemplates.jsx` (593줄), `ChannelTrend.jsx` (550줄) |
| API 클라이언트 | [frontend/src/api/orgCustomerApi.js](frontend/src/api/orgCustomerApi.js) 1개뿐 — 나머지는 `window.*` 글로벌 |
| 글로벌 데이터 | [frontend/src/data.js](frontend/src/data.js) (1476줄)이 `window`에 28개+ 주입 (CUSTOMERS, ENGINEERS, ME, SERVICES, TODAY_SCHEDULE, HISTORY, WEEK_KPI, KB_DOCUMENTS, TEAMS, POSITIONS 등) |
| API 응답 | 성공: raw, 실패: `{ error, detail }` (server.js:472-479 `handleApiError`) — **표준화 필요** |
| docs 폴더 | 없음 — 신규 생성 |

---

## Phase 0 — 공통 기반

### 0.1 백엔드 디렉토리 골격
도메인별 폴더 + 5축(`schema/repository/routes/validators/services`)으로 재편.

```
backend/src/
├── server.js                  # bootstrap (1063줄 → ~80줄)
├── app.js                     # express 앱 + 미들웨어
├── config/env.js
├── infra/
│   ├── oracle/
│   │   ├── pool.js            # 현 oracle.js → 이전
│   │   ├── withConnection.js
│   │   ├── withTransaction.js # 신규(rollback 자동)
│   │   ├── helpers.js         # clobFetchHandler, requiredText, toFlag, toNullableInt 통합
│   │   └── errorCodes.js      # ORA-00955 등
│   ├── pdf/chromeRenderer.js  # server.js:896-934 분리
│   └── logger.js
├── http/
│   ├── apiResponse.js         # success/error envelope 헬퍼
│   ├── asyncHandler.js
│   ├── errorHandler.js
│   └── validators/
│       ├── primitives.js      # toNumber, toBoolean
│       └── pagination.js
├── modules/
│   ├── home/
│   ├── attendance/{schema,repository,routes,validators}/
│   ├── calendar/{schema,repository,routes,validators}/
│   ├── support-history/{schema,repository,routes,services,validators}/
│   ├── knowledge-base/{schema,repository,routes,services}/
│   ├── weekly-report/{schema,repository,routes,services}/
│   ├── matrix/{schema,repository,routes}/
│   ├── organization/{schema,repository,routes}/
│   ├── customers/{schema,repository,routes}/
│   └── settings/
│       ├── report-templates/  # 기존
│       ├── service-master/
│       ├── checklists/
│       ├── ai-models/
│       └── rbac/
└── scripts/
    ├── initSchema.js          # 모든 ensureXxxSchema 일괄
    └── syncOrgCustomers.js    # 기존 유지
```

### 0.2 프론트엔드 디렉토리 골격
`features/<도메인>` 패턴 + `shared/`, `layout/`, `legacy/` (점진 제거).

```
frontend/src/
├── main.jsx
├── app.jsx                    # 라우팅 표만
├── shared/
│   ├── api/{apiClient.js, apiBase.js, errors.js}
│   ├── components/            # SlidePanel, EmptyState, Toast, CommandK 등
│   ├── hooks/{useApi, useDebouncedValue, useToast}
│   ├── utils/{formatDate, formatDuration, korean}
│   └── icons/Icon.jsx
├── layout/{AppShell, TopBar, MenuRail, ChannelPanel}.jsx
├── features/
│   ├── home/{api, components, hooks}/
│   ├── messaging/             # Workspace.jsx (분리는 별도 작업)
│   ├── calendar/{api, components, hooks}/
│   ├── support-history/{api, components, domain}/
│   ├── knowledge-base/{api, components}/
│   ├── weekly-report/{api, components}/
│   ├── matrix/{api, components}/
│   ├── organization/{api, components, domain}/
│   ├── customers/{api, components}/
│   └── settings/{api, components, tabs}/
└── legacy/                    # data.js, data2.js 등 점진 제거
```

### 0.3 파일 헤더 주석 표준 (한국어 필수)
모든 신규/이동 파일 상단에 표준 블록.

```javascript
/**
 * 파일: backend/src/modules/calendar/repository/eventsRepository.js
 * 역할: 일정관리(events) 테이블 CRUD 및 주차/월별 조회 SQL.
 * 입력: oracledb Connection, payload(plain object)
 * 출력: 정규화된 row 또는 row[]
 *
 * 연관 파일:
 *   - schema/eventsSchema.js          : 테이블 DDL
 *   - routes/eventsRoutes.js          : HTTP 라우트(본 모듈 호출)
 *   - validators/eventsValidators.js  : 입력 검증
 *   - infra/oracle/helpers.js         : clobFetchHandler 등 공용
 *
 * 비고: 트랜잭션 커밋은 라우트 레이어 책임.
 */
```

원칙: 첫 줄 = 한 문장 역할, "연관 파일" 섹션 = 직간접 의존 모두 나열, 한국어 우선·식별자만 영문, 8~20줄 분량.

### 0.4 API 응답 규약 (단일 추천안)
```
성공: HTTP 200/201   { "ok": true, "data": <payload>, "meta": { "total": N }? }
실패: HTTP 4xx/5xx   { "ok": false, "error": { "code": "...", "message": "한국어", "detail": <opt> } }
```
에러 코드 5종 시작: `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `ORACLE_UNAVAILABLE`, `INTERNAL`.

호환 마이그레이션: `apiClient.js`에서 `body.ok === true ? body.data : throw ApiError(body.error)`. envelope 미적용 라우트는 raw 통과로 backward-compat.

### 0.5 공통 유틸 추출
| 추출 대상 | 출처 | 이전 후 위치 |
|---|---|---|
| `apiGet/Post/Patch/Delete`, `parseApiResponse` | `frontend/src/api/orgCustomerApi.js:9-101` | `shared/api/apiClient.js` |
| `withOracleConnection`, `getOraclePool` | `backend/src/oracle.js` | `infra/oracle/{pool,withConnection}.js` |
| `clobFetchHandler` | `reportTemplateRepository.js:177` | `infra/oracle/helpers.js` |
| `requiredText, toNullableInt, toFlag, validationError, notFoundError, conflictError, isUniqueError` | orgCustomerRepository.js + reportTemplateRepository.js (중복) | `infra/oracle/helpers.js` + `http/errors.js` |
| `ensureOracleConfigured, handleApiError, toNumber, toBoolean` | `server.js:463-489` | `http/{errorHandler,apiResponse}.js` |
| `escapeHtml, textToHtml, pathToFileUrl, contentDisposition` | `server.js:948-980` | `infra/pdf/htmlUtils.js` |
| `renderPdfWithChrome, findChromeExecutable` | `server.js:896-946` | `infra/pdf/chromeRenderer.js` |
| `buildMasterReportHtml, buildReportHtml, generateSvgCharts` | `server.js:501-1063` | `modules/weekly-report/services/reportRenderer.js` |
| `formatDateTime*, formatDuration, getMonthKey` | `frontend/src/supportHistory.js:131-168` | `shared/utils/format*.js` |

### 0.6 Pages.jsx 9개 분리 매핑

| 라인 | 컴포넌트 | 이전 위치 |
|---|---|---|
| 34–48 | ChannelLanding | `features/messaging/components/ChannelLanding.jsx` |
| 51–150 | Calendar | `features/calendar/components/CalendarPage.jsx` |
| 153–459 | SupportHistory | `features/support-history/components/SupportHistoryPage.jsx` |
| 460–665 | HistoryRegisterModal | `features/support-history/components/HistoryRegisterModal.jsx` |
| 666–770 | HistoryDetailModal | `features/support-history/components/HistoryDetailModal.jsx` |
| 771–794 | HistDetailBlock, ParticipantStack | 동(`HistDetailBlock.jsx`, `ParticipantStack.jsx`) |
| 795–1366 | KnowledgeBase + 보조 | `features/knowledge-base/components/{KnowledgeBasePage,KbCategoryNode,KbRegisterModal,IndexStatus,DocTypeBadge,VersionMatchBadge,KbDocDetail}.jsx` |
| 1367–1869 | Organization + 보조 | `features/organization/components/{OrganizationPage,OrgChartView,OrgTreeNode,DeptView,ProfileView,StaffRow,OrgStat}.jsx` |
| 1870–2020 | CustomerMgmtLegacy | **폐기**(`components/CustomerMgmt.jsx`가 신규 본체) |
| 2021–2261 | ReportPage | `features/weekly-report/components/ReportPage.jsx` (모달 분리하면 ~150줄) |
| 2264–2300 | MatrixCellDetail | `features/matrix/components/MatrixCellDetail.jsx` |
| 2302–2432 | MatrixPage | `features/matrix/components/MatrixPage.jsx` |
| 2434–2458 | SettingsPage | `features/settings/components/SettingsPageLegacy.jsx` |

이전 시 주의: `Pages.jsx` 상단 `import` 블록의 `Ring/Segment/TypeTag` 헬퍼는 `Dashboard.jsx`에 정의 → `shared/components/charts/`로 추출. `app.jsx:8-16`의 단일 import는 9개 features import로 변경.

### 0.7 docs 디렉토리 골격 (신규 생성)
```
docs/
├── README.md                  # 전체 문서 인덱스
├── architecture/
│   ├── overview.md
│   ├── backend.md
│   ├── frontend.md
│   ├── database.md            # ER + 테이블 카탈로그
│   ├── api-conventions.md     # envelope, 에러 코드
│   ├── coding-standards.md    # 500줄, 헤더, 한국어
│   ├── deployment.md          # 7000/7001 포트, ENV
│   └── adr/
│       ├── 0001-oracle-only.md
│       ├── 0002-no-orm-raw-sql.md
│       ├── 0003-vertical-slice-by-menu.md
│       └── 0004-api-envelope.md
├── modules/
│   ├── home/README.md
│   ├── calendar/README.md
│   ├── support-history/README.md
│   ├── knowledge-base/README.md
│   ├── weekly-report/README.md
│   ├── matrix/README.md
│   ├── organization/README.md
│   ├── customers/README.md
│   └── settings/README.md
├── guides/
│   ├── local-setup.md
│   ├── adding-new-menu.md
│   ├── ddl-migration.md       # ensureXxxSchema 패턴
│   ├── pdf-rendering.md
│   └── i18n-korean.md
└── runbooks/
    ├── oracle-troubleshooting.md
    └── pdf-render-failure.md
```

### 0.8 메뉴별 기술서 표준 섹션 (8개)
모든 `docs/modules/<menu>/README.md`는 동일 8섹션:
1. 메뉴 개요 — 사용자 시나리오, 책임 경계
2. 화면/UX 흐름 — 진입/필터/등록/수정 시퀀스
3. 데이터 모델 — 테이블 카탈로그, 컬럼 의미, 인덱스
4. API 엔드포인트 — 메서드/경로/요청/응답 envelope 예시
5. 프론트엔드 모듈 구성 — features/<menu>/ 트리
6. 주요 비즈니스 로직 — (예: 가동률 계산, 자기참조 트리)
7. 의존성 — 다른 메뉴와의 외래키/UI 연결
8. 운영 시 알려진 이슈 / TODO

### Phase 0 진행 순서
0.7 → 0.8(architecture 초안) → 0.4(API 규약) → 0.5(공통 유틸) → 0.1(BE 골격) → 0.2(FE 골격) → 0.6(Pages.jsx 분해) → 0.3(헤더 주석 일괄)

---

## Phase 1 — 메뉴별 수직 완성

각 메뉴는 **7-task 시퀀스**: `1.x.1 DDL → 1.x.2 Repository → 1.x.3 Routes → 1.x.4 API 클라이언트 → 1.x.5 UI 연결 → 1.x.6 기술서 → 1.x.7 E2E 검증`. 추정 컬럼은 구현 직전 사용자 검토.

### 1.1 홈 (nav='home') — 마지막 진행
- 별도 테이블 없음(다른 도메인 집계). 옵션: `HOME_PINNED_QUICK_LINKS`.
- API: `GET /api/home/{summary,today-schedule,engineer-progress}`
- UI: `Dashboard.jsx`의 `window.WEEK_KPI/TODAY_SCHEDULE/ENG_PROGRESS` → 각각 `useHomeSummary/useTodaySchedule/useEngineerProgress` 훅
- 의존: 1.2/1.3/1.5/1.7 데이터 채워진 후 의미 있음

### 1.2 일정관리 (nav='cal')
- 테이블: `EVENTS`, `EVENT_PARTICIPANTS`, `ATTENDANCE_NOTICES`(직출/직퇴, 현 attendanceMock.js의 Oracle화)
- 주요 컬럼 — EVENTS: TITLE, EVENT_TYPE(routine/tech/incident/meeting/install), CUSTOMER_ID(FK), START_AT, END_AT, METHOD(onsite/remote), MEMO CLOB, CREATED_BY(FK USERS)
- API: `GET/POST/PATCH/DELETE /api/calendar/events`, `GET/POST/PATCH /api/attendance/notices`(mock→DB)
- UI: `CalendarPage.jsx`의 하드코딩 `events` 배열(라인 55-69) 제거 → `useEvents({ from, to })`

### 1.3 지원이력 (nav='hist')
- 테이블: `SUPPORT_HISTORIES`(HISTORY_ID 'H-XXXXXX', CUSTOMER_ID, SERVICE_NAME, HISTORY_TYPE, SUPPORT_MODE, STATUS, PRIORITY, SUMMARY, WORK_DETAIL CLOB, FINDING CLOB, ACTION_RESULT CLOB, DEPARTURE_AT, SUPPORT_STARTED_AT, SUPPORT_ENDED_AT, RETURN_AT), `SUPPORT_HISTORY_PARTICIPANTS`(IS_MANAGER 플래그)
- API: `GET /api/support-history?customerId&engineerId&from&to&type&method&q` (페이징), `POST/PATCH/DELETE`, `POST /api/support-history/bulk` (일괄 status 변경)
- UI: `window.HISTORY` → `useSupportHistory`. 가동률 계산은 프론트 유지(ADR 작성).

### 1.4 지식베이스 (nav='kb')
- 테이블: `KB_CATEGORIES`(자기참조), `KB_DOCUMENTS`, `KB_DOCUMENT_TAGS`, `KB_DOCUMENT_VERSIONS`
- 컬럼 핵심 — KB_DOCUMENTS: TITLE, DOC_TYPE(runbook/check_item/training), SERVICE_MASTER_ID, PRODUCT_NAME, VERSION_RANGE, OS_PLATFORM, VENDOR, AUTHOR_USER_ID, STATUS, INDEX_* 진행률 컬럼들
- 카테고리 자손 조회: `CONNECT BY PRIOR` (현 server.js:458 `descendantCategoryIds` SQL화)
- API: 기존 `/api/kb/{categories,documents,documents/:id/indexing,documents/:id/reindex}` 인메모리 → DB
- UI: `window.KB_CATEGORIES/KB_DOCUMENTS` 의존 제거

### 1.5 주간업무보고 (nav='rep')
- 테이블: `WEEKLY_REPORTS`(PAYLOAD CLOB JSON), `WEEKLY_REPORT_ITEMS`(EVENT_ID/HISTORY_ID 연결), `TEAMS`(현 window.TEAMS, DEPARTMENTS와 분리/통합 결정 필요)
- API: `GET/POST /api/weekly-reports?weekStart`, `GET /api/teams`, 기존 `/api/reports/render-pdf`(binary 응답 — envelope 우회)
- UI: `window.TEAMS/NEXT_WEEK_SCHEDULE/ROUTINE_LIST/WEEK_WORKS` → API. "다음 주 일정 추가" 모달은 `useEvents` 재사용

### 1.6 작업현황표 (nav='mat')
- 테이블: `ROUTINE_PLANS`(CUSTOMER_ID, SERVICE_NAME, PERIOD_YEAR, PERIOD_HALF 1/2, TARGET_FREQ, UK 4컬럼), `ROUTINE_PLAN_CELLS`(PLAN_ID, PERIOD_MONTH 1~12, STATUS pending/done/urgent, HISTORY_ID FK)
- API: `GET /api/matrix?year&half&scope=me|all`, `PATCH /api/matrix/cells/:planId/:month`
- UI: `Math.random()` 가짜 데이터(라인 2302-2432) 제거

### 1.7 조직도 (nav='org') — 이미 DB 연동, 표준화만
- 추가 테이블(선택): `POSITIONS` — 현재 USERS.POSITION_NAME 자유 입력. 마스터화 결정 필요
- Repository 분리: `orgCustomerRepository.js` → `departmentsRepository.js` + `usersRepository.js` + `positionsRepository.js`
- envelope 마이그레이션, `/api/org/positions` 추가, `window.POSITIONS` 의존 제거
- `docs/modules/organization/README.md` 신규

### 1.8 고객사 (nav='cust') — 이미 DB 연동, 표준화 + 확장
- 추가 테이블: `CUSTOMER_ASSIGNMENTS`(CUSTOMER_ID + USER_ID + ROLE primary/secondary/sales)
- Repository 분리: customers / customerAliases / customerAssignments
- API 추가: `/api/customers/:id/assignments` GET/POST/DELETE
- UI: 담당자 배정 UI 추가
- `docs/modules/customers/README.md` 신규

### 1.9 관리설정 (nav='set')
- 테이블 ~10개:
  - `SERVICE_MASTER`(NAME, CATEGORY DB/OS/NW, DEFAULT_FREQ), `SERVICE_MASTER_VERSIONS`
  - `CHECKLISTS`(NAME, VERSION, STATUS, SCOPE service/customer/customerService, PAYLOAD CLOB)
  - `AI_PROVIDERS`, `AI_MODELS`(USE_CASES_CSV, ENABLED), `AI_USE_CASES`
  - `RBAC_ROLES`, `RBAC_PERMISSIONS`(GROUP_KEY, NAME), `RBAC_ROLE_PERMISSIONS`
  - `AUDIT_LOG`(ACTOR_USER_ID, ACTION, TARGET_TYPE, TARGET_ID, PAYLOAD CLOB, AT_TIME)
- API: `/api/settings/{service-master,checklists,ai-models,rbac/roles,rbac/permissions,audit}`
- UI: `Settings.jsx`(841줄) + `Settings2.jsx`(1423줄) → `features/settings/tabs/{ServiceMasterTab,ChecklistTab,AiModelTab,RbacTab,ReportTemplateTab}.jsx`로 분리. `ReportMasterTemplates.jsx`는 envelope만 적용
- 글로벌 의존 제거: `window.SERVICE_MASTER/CHECKLISTS/AI_MODELS/ROLES/RBAC_MATRIX/AUDIT_LOG`

### Phase 1 메뉴 진행 순서 (의존성 기반)
**1.8 고객사 → 1.7 조직도 → 1.9(부분, 마스터/RBAC) → 1.2 일정 → 1.3 지원이력 → 1.4 지식베이스 → 1.6 작업현황표 → 1.5 주간보고 → 1.9(나머지) → 1.1 홈 → Phase 2**

이미 동작 중인 1.7/1.8을 먼저 표준화해 패턴을 확정하면 신규 메뉴들이 그 패턴을 그대로 따라간다. 1.1 홈은 모든 메뉴 의존이라 마지막.

---

## Phase 2 — 마무리

### 2.1 통합 검증 시나리오
"신규 부서/사용자/고객사 등록 → 일정 등록 → 직출 알림 → 지원이력 등록 → 점검계획 셀 자동 done → 주간보고서 작성 → PDF 다운로드 → 보고서 템플릿 변경 후 재출력"을 단일 시나리오로 시연.

### 2.2 회귀 자동 점검
- `frontend/src/data.js`의 잔존 글로벌 grep — 0건
- `Pages.jsx` 존재 여부 — 없음
- `wc -l` 자동 체크 — 모든 파일 500줄 이하
- 모든 GET 엔드포인트 envelope 응답 확인

### 2.3 문서 최종 업데이트
- `docs/architecture/database.md` 최종 ER (추가된 ~25개 테이블 포함)
- 9개 `docs/modules/*/README.md` 갱신
- ADR `0005-pages-jsx-disposition.md` (해체 회고)

### 2.4 정리(선택)
`mockData.js`, `attendanceMock.js`, `data.js`, `data2.js`, `Sidebar.legacy.jsx` 등 dead code 삭제. **실행 첫 작업으로 임시 파일 정리: `C:\Dev\Databank\.tmp_plan_part_0.txt` ~ `.tmp_plan_part_4.txt`** (계획 작성 중 생성됨).

---

## 의존성 / 위험 요소

### 메뉴 의존도
```
[조직(1.7)+고객사(1.8)] ─┬─ 일정(1.2)
                          ├─ 지원이력(1.3) ─ 작업현황표(1.6)
                          ├─ 지식베이스(1.4)
                          ├─ 주간보고(1.5) ← 일정(1.2), 지원이력(1.3)
                          └─ 관리설정(1.9)
[홈(1.1)] ← 1.2, 1.3, 1.5, 1.7 모두
```

### 트랜잭션 단위
- 지원이력 등록 + 참여자 다중 INSERT
- 주간보고 + 항목 N개
- 매트릭스 셀 자동 갱신(지원이력 등록 시 `ROUTINE_PLAN_CELLS` UPDATE)
- 지식베이스 문서 + 태그/버전 다중 INSERT
- 고객사 + 별칭 + 담당자 동시
- 신규 헬퍼 `withOracleTransaction`(rollback 자동) 도입 권장

### Oracle 특성 주의
- `VARCHAR2(N CHAR)` 단위 강제(한글) — 현 패턴 유지
- CLOB은 `clobFetchHandler` 필수 — 모든 Repository에서 import
- `IDENTITY` 12c+ 동작(현 19c는 안전), USERS.USER_ID처럼 외부 ID는 IDENTITY 미사용
- `CONNECT BY PRIOR`로 KB_CATEGORIES 자손 조회
- KST/UTC: 현재 `SYSTIMESTAMP` 사용(서버 타임존). UTC 저장+클라 변환 표준화는 ADR로 결정
- 자기참조 ON DELETE 절 없음 — `enabled=0` 소프트 삭제 패턴 유지
- ORA-00955 swallow 패턴(`isAlreadyExists`)
- Connection Pool: min=1, max=4 — 운영 ENV 조정

### 기타 위험
- `data.js` 1476줄, `window.*` 28개+ — `legacy/` 격리 후 메뉴 작업할 때마다 점진 제거
- `Workspace.jsx`(170KB) 분해는 본 계획 범위 외 (별도 작업)
- PDF 렌더링(`findChromeExecutable`)이 Windows 경로만 검사 — Linux 운영 시 보강
- KB `reindex`는 mock 진행률 — 실제 임베딩은 범위 외

---

## 검증 방법

### Phase 0 검증
| 검증 | 방법 |
|---|---|
| 디렉토리 골격 | `find backend/src/modules -type d` → 9개 도메인 |
| 500줄 한도 | `find backend frontend -name "*.jsx" -o -name "*.js" \| xargs wc -l \| awk '$1>500{print}'` 결과 0 |
| Pages.jsx 분해 | `Pages.jsx` 미존재, `app.jsx` import가 features/* 9개로 분산 |
| envelope | `curl -s http://127.0.0.1:7001/api/customers \| jq '.ok'` → `true` |
| 기술서 | `ls docs/modules` → 9개 README.md |

### 메뉴별 E2E (curl + UI 시퀀스)

```bash
# 1.7 조직도
curl -s -X POST http://127.0.0.1:7001/api/org/departments \
  -H "Content-Type: application/json" \
  -d '{"name":"검증부서","sortOrder":99}'

# 1.8 고객사
curl -s -X POST http://127.0.0.1:7001/api/customers \
  -H "Content-Type: application/json" \
  -d '{"customerMain":"검증주식회사","aliases":["검증사"]}'

# 1.2 일정
curl -s -X POST http://127.0.0.1:7001/api/calendar/events \
  -d '{"title":"검증 일정","eventType":"routine","customerId":<CID>,"startAt":"2026-05-12T09:00","endAt":"2026-05-12T11:00","method":"onsite"}'

# 1.3 지원이력
curl -s -X POST http://127.0.0.1:7001/api/support-history \
  -d '{"customerId":<CID>,"serviceName":"Oracle 19c","historyType":"routine","supportMode":"onsite","supportStartedAt":"2026-05-12T09:00","supportEndedAt":"2026-05-12T11:00","participants":[<UID>]}'

# 1.4 지식베이스
curl -s -X POST http://127.0.0.1:7001/api/kb/categories -d '{"name":"검증 카테고리","icon":"book"}'
curl -s -X POST http://127.0.0.1:7001/api/kb/documents -d '{"title":"검증 문서","categoryId":"<CAT>","docType":"runbook"}'

# 1.6 매트릭스
curl -s "http://127.0.0.1:7001/api/matrix?year=2026&half=1&scope=all" | jq '.data[0].cells | length'  # 6

# 1.5 주간보고
curl -s "http://127.0.0.1:7001/api/weekly-reports?weekStart=2026-05-04"
curl -X POST http://127.0.0.1:7001/api/reports/render-pdf -d @payload.json -o out.pdf
```

각 메뉴 UI는 좌측 메뉴 클릭 → 빈 목록 → 등록 모달 → 행 표시 → 새로고침 후 유지 → 다른 메뉴와 연동 확인 시퀀스 공통.

### Phase 2 통합 시연
9개 메뉴 단일 시나리오 시연(위 2.1) + 자동 점검(2.2) + 문서 갱신(2.3).

---

## Critical Files (구현 진입점)

- [backend/src/server.js](backend/src/server.js) — 1063줄, 9개 도메인 분해
- [backend/src/oracle.js](backend/src/oracle.js) — 풀/래퍼 이전
- [backend/src/orgCustomerSchema.js](backend/src/orgCustomerSchema.js) — schema 분리 패턴 기준
- [backend/src/orgCustomerRepository.js](backend/src/orgCustomerRepository.js) — Repository 분리
- [backend/src/reportTemplateRepository.js](backend/src/reportTemplateRepository.js) — `clobFetchHandler` 추출 원본
- [frontend/src/components/Pages.jsx](frontend/src/components/Pages.jsx) — 2460줄, 9개 분해
- [frontend/src/api/orgCustomerApi.js](frontend/src/api/orgCustomerApi.js) — apiClient 추출 원본
- [frontend/src/data.js](frontend/src/data.js) — 1476줄, `window.*` 28개+ 점진 제거
- [frontend/src/components/Settings.jsx](frontend/src/components/Settings.jsx), [Settings2.jsx](frontend/src/components/Settings2.jsx) — 합 2264줄, 탭 분리
- [frontend/src/app.jsx](frontend/src/app.jsx) — features/* import로 변경

---

## 작업 단위(Task) 요약 — 총 73개

**Phase 0 (8 task)**: 0.1~0.8

**Phase 1 (9 메뉴 × 7 task = 63 task)**:
- [x] **Phase 1 (9 task)**: 1.1 홈(Dashboard), 1.2 일정관리, 1.3 메시징(Workspace 분리), 1.4 지식베이스, 1.5 주간보고, 1.6 작업현황표(Matrix), 1.7 조직도(직급 마스터), 1.8 고객사(담당자 배정), 1.9 관리설정(컴포넌트화) — **전부 완료**
- [x] **Phase 2 (4 task)**: 2.1 통합 검증, 2.2 회귀 점검, 2.3 문서 최종, 2.4 정리(레거시 삭제) — **완료**


**환각 방지**: 각 task 시작 전 해당 라인 범위/파일을 다시 읽고, 추정 컬럼은 사용자 컨펌 후 DDL 확정.
