# 프론트엔드 아키텍처

React 18 + Vite 6. 메뉴별 `features/<도메인>/` 폴더에 모든 관심사를 모은다.

## 진입점 흐름

```
frontend/src/main.jsx
   │ ReactDOM.createRoot
   ▼
frontend/src/app.jsx              (라우팅 표 — nav 코드 → feature 페이지 매핑)
   │ <AppShell>
   ▼
frontend/src/layout/AppShell.jsx  (TopBar + MenuRail + ChannelPanel + 본문 슬롯)
   │ 본문 슬롯에 활성 nav의 feature 페이지
   ▼
frontend/src/features/<X>/components/<X>Page.jsx
   │ ../api/<X>Api.js
   ▼
shared/api/apiClient.js (apiGet/Post/Patch/Delete + envelope 풀이)
   │ fetch
   ▼
백엔드 (포트 7001)
```

## 디렉토리 구조 (Phase 0 후)

```
frontend/src/
├── main.jsx
├── app.jsx                          # 라우팅 표만(약 100줄 목표)
├── shared/
│   ├── api/
│   │   ├── apiClient.js             # apiGet/Post/Patch/Delete + envelope 풀이
│   │   ├── apiBase.js               # window.DATABANK_API_BASE 단일 책임
│   │   └── errors.js                # ApiError 타입
│   ├── components/                  # SlidePanel, EmptyState, Toast, CommandK, Shortcuts, CustomerCombobox 등
│   ├── components/charts/           # Ring, Segment, TypeTag (Pages/Dashboard에서 추출)
│   ├── hooks/{useApi, useDebouncedValue, useToast}.js
│   ├── ui-tokens/                   # 디자인 토큰
│   ├── utils/{formatDate, formatDuration, korean}.js
│   └── icons/Icon.jsx
├── layout/
│   ├── AppShell.jsx
│   ├── TopBar.jsx
│   ├── MenuRail.jsx
│   └── ChannelPanel.jsx
├── features/
│   ├── home/                        # 홈 nav='home'
│   ├── messaging/                   # Workspace 분해는 별도 작업
│   ├── calendar/                    # 일정관리 nav='cal'
│   ├── support-history/             # 지원이력 nav='hist'
│   ├── knowledge-base/              # 지식베이스 nav='kb'
│   ├── weekly-report/               # 주간업무보고 nav='rep'
│   ├── matrix/                      # 작업현황표 nav='mat'
│   ├── organization/                # 조직도 nav='org'
│   ├── customers/                   # 고객사 nav='cust'
│   └── settings/                    # 관리설정 nav='set'
└── legacy/                          # 점진 제거 대상
    ├── data.js
    ├── data2.js
    ├── tweaks-panel.jsx
    └── Sidebar.legacy.jsx
```

각 `features/<X>/` 표준 하위 구조:

```
features/<X>/
├── api/<X>Api.js                    # 백엔드 호출 — envelope 풀어서 plain JS로
├── components/                      # 페이지 + 모달 + 보조 (각 500줄 이하)
├── hooks/                           # use<X>List, use<X>Detail 등 — fetch + state
└── domain/                          # 순수 함수(가동률 계산, 트리 평탄화 등)
```

## 핵심 원칙

1. **window 글로벌 금지**: 신규 코드는 `window.*`에 의존 안 함. 기존 `data.js` 28개 글로벌은 `legacy/`로 격리하고 메뉴 작업할 때마다 점진 제거.
2. **API 호출은 features/<X>/api/만**: 컴포넌트가 직접 fetch 안 함. 모든 호출은 apiClient를 거친다.
3. **공유는 shared/**: 두 메뉴 이상이 쓰는 것만 shared로. 한 메뉴 전용은 features 내부.
4. **500줄 한도**: 컴포넌트가 커지면 모달/뷰/카드 등을 별도 파일로.
5. **import 경로**: features 간 직접 import 금지. shared를 거쳐 공유.

## 라우팅

`app.jsx`의 라우팅 표(추정 형태):

```jsx
const NAV_TO_PAGE = {
  home: () => import('./features/home/components/HomePage.jsx'),
  cal: () => import('./features/calendar/components/CalendarPage.jsx'),
  hist: () => import('./features/support-history/components/SupportHistoryPage.jsx'),
  kb: () => import('./features/knowledge-base/components/KnowledgeBasePage.jsx'),
  rep: () => import('./features/weekly-report/components/ReportPage.jsx'),
  mat: () => import('./features/matrix/components/MatrixPage.jsx'),
  org: () => import('./features/organization/components/OrganizationPage.jsx'),
  cust: () => import('./features/customers/components/CustomerMgmtPage.jsx'),
  set: () => import('./features/settings/components/SettingsShell.jsx'),
};
```

지연 로딩(`React.lazy`)은 Phase 1에서 결정. 현재는 즉시 import도 무방.

## 글로벌 데이터 점진 제거

`frontend/src/data.js`(약 1476줄)이 `Object.assign(window, {...})`로 28개+ 객체를 주입한다. Phase 1에서 메뉴를 작업할 때마다:

1. 해당 메뉴가 쓰는 글로벌(예: `window.HISTORY`)을 features API로 대체.
2. `data.js`에서 해당 export 제거.
3. 다른 메뉴가 같은 글로벌을 참조하는지 grep으로 확인 후 제거.

전부 비워지면 `data.js`/`data2.js`는 삭제.

## 관련 문서
- [api-conventions.md](api-conventions.md)
- [coding-standards.md](coding-standards.md)
- [adr/0003-vertical-slice-by-menu.md](adr/0003-vertical-slice-by-menu.md)
