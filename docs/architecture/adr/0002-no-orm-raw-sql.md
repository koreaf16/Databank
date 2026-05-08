# ADR 0002 — ORM 미사용, Raw SQL + Repository 패턴

## 상태
Accepted

## 컨텍스트

신규 Node.js 백엔드에서 Prisma, Sequelize, TypeORM, Knex 같은 ORM/쿼리빌더 도입 여부를 검토했다.

본 시스템 특징:
- Oracle 19c 단일 지원([0001](0001-oracle-only.md))
- 운영 DBA가 SQL 직접 작성·튜닝
- 마이그레이션 도구 없이 `ensureXxxSchema(connection)` 패턴으로 DDL 멱등 실행 중

## 결정

**ORM/쿼리빌더 미도입. Raw SQL + Repository 패턴 유지.**

- Repository 함수: `repoFn(connection, payload)` 형식
- DDL: 코드 기반(`ensureXxxSchema`) — Prisma migrate 같은 별도 도구 없음
- 컬럼 추가: `MIGRATION_DDL` 배열 + ORA-01430 swallow

## 결과

- 장점:
  - SQL 본문이 코드에 그대로 노출 — DBA가 즉시 읽고 EXPLAIN PLAN 분석 가능
  - 빌드/생성 단계 없음(Prisma generate 같은 의존성 없음)
  - bind 파라미터 직접 작성 — 의도하지 않은 타입 변환 없음
- 단점:
  - 보일러플레이트 일부 발생(파라미터 바인딩, row 정규화)
  - 자동 마이그레이션 없음 — 운영 시 ALTER 스크립트 직접 관리

## 보일러플레이트 완화

`infra/oracle/helpers.js`로 공용 유틸을 추출:
- `clobFetchHandler` — CLOB → string 자동
- `requiredText`, `toNullableInt`, `toFlag` — 입력 검증
- `validationError`, `notFoundError`, `conflictError`, `isUniqueError` — 표준 에러

## 재고 시점

- 50개 이상 테이블이 되거나
- 동시 운영 DB가 추가되거나
- 마이그레이션 자동화가 필수가 되면 재검토

## 관련
- [0001-oracle-only.md](0001-oracle-only.md)
- [../backend.md](../backend.md)
- [../../guides/ddl-migration.md](../../guides/ddl-migration.md)
