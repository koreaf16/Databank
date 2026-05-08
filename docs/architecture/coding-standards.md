# 코딩 표준

DataBank 코드베이스의 공통 작성 규칙. 모든 신규/이동 파일은 본 문서를 따른다.

## 1. 파일당 500줄 이하

- `.js`, `.jsx`, `.ts`, `.tsx` 모두 500줄 한도
- 초과 시 도메인/책임 단위로 분리(모달, 카드, 셀, 행, 헤더 등)
- 검증: `find backend frontend -name "*.jsx" -o -name "*.js" | xargs wc -l | awk '$1>500{print}'` 결과 0

## 2. 디렉토리: 기능별·깊이별로 깊게

- 평면 폴더 금지. 백엔드는 `modules/<도메인>/{schema,repository,routes,validators,services}/`
- 프론트는 `features/<도메인>/{api,components,hooks,domain}/`
- 한 도메인 안에서도 의미별 폴더(`tabs/`, `badges/`, `charts/`)

## 3. 파일 헤더 주석 (한국어 필수)

모든 신규/이동 파일 상단에 표준 블록.

### 백엔드 예시
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

### 프론트엔드 예시
```jsx
/**
 * 파일: frontend/src/features/support-history/components/SupportHistoryPage.jsx
 * 역할: 지원이력 목록 조회/필터링/등록 화면. nav === 'hist' 활성 시 렌더.
 *
 * 연관 파일:
 *   - ../api/historyApi.js                       : 백엔드 호출
 *   - ./HistoryRegisterModal.jsx                 : 신규 등록 모달
 *   - ./HistoryDetailModal.jsx                   : 행 클릭 상세
 *   - ../domain/utilization.js                   : 가동률 집계 로직
 *   - shared/components/CustomerCombobox.jsx     : 고객사 콤보박스
 *   - shared/utils/formatDuration.js             : "1시간 30분" 포매팅
 *
 * Props:
 *   - fromChannel: 채널에서 페이지 진입 시 컨텍스트 (선택)
 */
```

### 원칙
- 첫 줄 = 한 문장으로 절대적 역할
- "연관 파일" 섹션 = 직간접 의존을 모두 나열(상대경로 또는 src 기준)
- 한국어 우선, 식별자(함수명/테이블명)는 영문 그대로
- 분량 8~20줄 — 본문 코드량과 균형

## 4. 한국어 우선

- UI 문구, 에러 메시지, 주석: 한국어
- 코드 식별자(변수/함수/타입/테이블): 영문 SNAKE/Camel
- 외부에 노출되는 한국어는 `error.message`, UI 텍스트, 주석에 한정

## 5. window 글로벌 금지(신규 코드)

- 신규 컴포넌트는 `window.*` 의존 금지
- 기존 `data.js` 글로벌은 `legacy/`로 격리, 메뉴 작업할 때마다 점진 제거
- 데이터는 `features/<X>/api/`를 통해 받아오기

## 6. 보안 훅 규칙(메모리 반영)

- 사용자가 강조한 보안 규칙은 코드 내 별도 훅(예: 인증/권한 체크)으로 분리
- Repository 레이어에 권한 체크 섞지 않음 — 라우트 또는 미들웨어에서

## 7. CSS 분리

- 공통 토큰: `shared/ui-tokens/`
- 컴포넌트별 스타일: 컴포넌트 파일과 같은 위치
- 한 CSS 파일도 500줄 한도 적용

## 8. 커밋 메시지

- 영문 동사 시작 권장 (`feat:`, `fix:`, `refactor:`, `docs:`)
- 한국어 본문도 허용
- 한 커밋 = 한 논리적 변경

## 9. 환경변수

- 키 이름: 대문자 SNAKE_CASE (`ORACLE_USER`, `ORACLE_CONNECT_STRING`, `DATABANK_API_BASE`)
- `.env.local`은 git 제외
- 헥스 컬러 등 `#` 포함 값은 따옴표 필수 (`#0c6cd6` → `"#0c6cd6"`)
- `config/env.js`에서 검증/기본값

## 10. 로깅

- `console.log` 직접 사용 금지(개발 디버깅 외) — `infra/logger.js` 사용
- 에러는 errorHandler가 일괄 로깅

## 검증 체크리스트 (PR 전 자가 점검)

- [ ] 500줄 이하?
- [ ] 헤더 주석 있고 연관 파일 명시?
- [ ] window 글로벌 신규 의존 없음?
- [ ] envelope 응답 사용?
- [ ] features/<X> 경계 침범 없음?
- [ ] CLOB 컬럼은 `clobFetchHandler` 사용?
