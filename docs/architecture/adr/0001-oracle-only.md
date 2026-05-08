# ADR 0001 — Oracle DB만 지원, multi-DB 추상화 없음

## 상태
Accepted

## 컨텍스트

DataBank Slack은 사내 Oracle DBA 운영 인프라에 종속된 시스템이다. 운영 DBA가 25년 Oracle 경력으로, Oracle 기능(IDENTITY, CONNECT BY PRIOR, CLOB, NLS_SORT, AWR 등)을 적극 활용할 수 있다.

multi-DB 추상화(예: ORM, Knex, generic SQL builder)를 도입할지 검토했다.

## 결정

**Oracle 19c만 지원한다. 추상화 레이어는 두지 않는다.**

- DDL은 Oracle 문법 그대로(IDENTITY, VARCHAR2 N CHAR)
- Repository는 `oracledb` 드라이버 직접 사용
- 시퀀스/CLOB/CTE 등 Oracle 고유 기능 자유롭게 활용

## 결과

- 장점:
  - Oracle 고유 최적화(stmtCacheSize, fetchHandler) 그대로 사용
  - 코드량 감소(추상화 레이어 없음)
  - 운영 DBA가 SQL 본문을 직접 읽고 튜닝 가능
- 단점:
  - 다른 DB로 이전 시 Repository를 전부 다시 작성
  - 그러나 본 시스템은 Oracle 기반이라 의도된 트레이드오프

## 영향

- 백엔드 `infra/oracle/`와 `modules/<X>/repository/`는 Oracle 종속을 명시적으로 받아들임
- 단, 비즈니스 로직(`services/`)은 Repository를 추상 호출하므로 일부 재사용 가능

## 관련
- [0002-no-orm-raw-sql.md](0002-no-orm-raw-sql.md)
- [../database.md](../database.md)
