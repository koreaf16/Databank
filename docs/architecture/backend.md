# 백엔드 아키텍처

Express 4.21 + Oracle 19c. 도메인별 모듈 폴더로 재편된다(`backend/src/modules/<도메인>/`).

## 진입점 흐름

```
backend/src/server.js              (bootstrap만, 약 80줄 목표)
   │ require('./app')
   ▼
backend/src/app.js                 (express 앱 + 미들웨어 + 라우트 마운트)
   │ require('./modules/<X>/routes/...')
   ▼
backend/src/modules/<X>/routes/    (HTTP 메서드 라우트)
   │ require('../repository/...')
   ▼
backend/src/modules/<X>/repository/  (SQL 본체 — Repository 패턴)
   │ withConnection / withTransaction
   ▼
backend/src/infra/oracle/pool.js   (oracledb 풀)
```

## 디렉토리 구조 (Phase 0 후)

```
backend/src/
├── server.js                  # 진입점 — 부트스트랩만
├── app.js                     # express 앱 생성, 미들웨어, 404
├── config/
│   ├── env.js                 # 환경변수 검증/기본값
│   └── index.js
├── infra/
│   ├── oracle/
│   │   ├── pool.js            # createPool / getPool
│   │   ├── withConnection.js  # 단일 connection 처리
│   │   ├── withTransaction.js # commit/rollback 자동
│   │   ├── helpers.js         # clobFetchHandler, requiredText, toFlag, toNullableInt 등
│   │   └── errorCodes.js      # ORA-00955 / ORA-00001 매핑
│   ├── pdf/
│   │   ├── chromeRenderer.js  # findChromeExecutable + render
│   │   └── htmlUtils.js       # escapeHtml, textToHtml, contentDisposition
│   └── logger.js              # morgan + 콘솔
├── http/
│   ├── apiResponse.js         # ok(data), fail(code, message, detail)
│   ├── asyncHandler.js        # try/catch 래퍼
│   ├── errorHandler.js        # 글로벌 에러 미들웨어
│   ├── errors.js              # ApiError 클래스
│   └── validators/
│       ├── primitives.js
│       └── pagination.js
└── modules/
    ├── home/
    ├── attendance/
    ├── calendar/
    ├── support-history/
    ├── knowledge-base/
    ├── weekly-report/
    ├── matrix/
    ├── organization/
    ├── customers/
    └── settings/
        ├── report-templates/
        ├── service-master/
        ├── checklists/
        ├── ai-models/
        └── rbac/
```

각 도메인은 `schema/`, `repository/`, `routes/`, `validators/`, `services/` 5축으로 더 깊이 나눈다.

## Repository 패턴 규칙

1. **모든 SQL은 Repository 안**. 라우트는 검증 + Repository 호출 + 응답 직렬화만.
2. **함수 시그니처**: `repoFn(connection, payload)` — connection을 외부에서 주입받는다(트랜잭션 합성 가능).
3. **반환값**: 정규화된 plain object. CLOB은 `clobFetchHandler`로 string 변환 후 반환.
4. **검증 실패**: `validationError(field, message)` throw → 에러 미들웨어가 400 매핑.
5. **이미 존재**: `isUniqueError(err)` 시 `conflictError(...)` 재던지기.

## 트랜잭션 정책

- 단일 SELECT/INSERT/UPDATE: `withConnection`
- 다중 INSERT/UPDATE 또는 부모-자식 동시 변경: `withTransaction`(rollback 자동)
- 라우트 레이어가 `withConnection/withTransaction`을 호출하고 Repository에 connection을 넘긴다.

## 미들웨어 순서 (app.js)

```
express()
  .use(cors)
  .use(express.json({ limit: '5mb' }))    // PDF payload 대응
  .use(morgan('dev'))
  .use('/api/health', healthRouter)
  .use('/api/...', 도메인 라우터들)
  .use(errorHandler)                       // 마지막 — ApiError → envelope 매핑
  .use(404 핸들러)
```

## API 응답 envelope

자세한 규약: [api-conventions.md](api-conventions.md). 핵심:
- 성공: `{ ok: true, data, meta? }`
- 실패: `{ ok: false, error: { code, message, detail? } }`
- PDF binary 응답은 envelope 우회(Content-Type: application/pdf 직접 전송).

## Oracle 연결

- `oracledb.createPool({ user, password, connectString, poolMin: 1, poolMax: 4, stmtCacheSize: 50 })`
- `withOracleConnection(async conn => { ... })` — 자동 release.
- `ensureOracleConfigured()` — ENV 누락 시 503 (`ORACLE_UNAVAILABLE`).

## 관련 문서
- [database.md](database.md) — 테이블 카탈로그
- [api-conventions.md](api-conventions.md) — 응답 규약
- [coding-standards.md](coding-standards.md) — 500줄 한도, 헤더 주석
- [adr/0002-no-orm-raw-sql.md](adr/0002-no-orm-raw-sql.md) — ORM 미사용 사유
