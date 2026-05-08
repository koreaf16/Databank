# 런북 — Oracle 장애 대응

DB 연결/쿼리 관련 운영 이슈가 발생했을 때의 절차.

## 1. `/api/health`에서 `oracle: down`

### 증상
```
GET /api/health
→ { "ok": true, "data": { "oracle": "down", ... } }
```

또는 모든 API가 503 `ORACLE_UNAVAILABLE` 반환.

### 1단계: 환경변수 확인
```bash
cat backend/.env
```
- `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING` 모두 채워졌는지
- `ORACLE_CONNECT_STRING` 형식: `host:port/service` 또는 TNS alias

### 2단계: 직접 연결 시도
```bash
sqlplus <user>/<pwd>@<connect_string>
```
- `ORA-12541` (no listener): 호스트/포트 잘못됨 또는 listener 다운
- `ORA-12514` (service not registered): service name 오타
- `ORA-01017` (invalid credentials): 비밀번호 오타 또는 계정 잠금
- `ORA-28000` (account locked): `ALTER USER <user> ACCOUNT UNLOCK;` (DBA 권한 필요)

### 3단계: 풀 상태 확인
백엔드 로그에서 `OracleDB pool` 관련 메시지:
```
ORA-24418: Cannot open further sessions  → poolMax 한계 도달
ORA-12516: TNS: no appropriate handler   → DB processes 한계
```
대응:
- `ORACLE_POOL_MAX` 줄이기 또는 DB의 `processes` 파라미터 증대(DBA)
- 누수 의심: `withConnection` 안에서 release 누락 점검

### 4단계: 백엔드 재기동
```bash
# concurrently 종료 후
npm run dev
```
또는 운영: 컨테이너/서비스 재시작.

## 2. 쿼리 느림

### 1단계: SQL_ID 식별
```sql
SELECT SQL_ID, ELAPSED_TIME, EXECUTIONS, SQL_TEXT
FROM V$SQLAREA
WHERE PARSING_SCHEMA_NAME = 'DATABANK'
ORDER BY ELAPSED_TIME DESC FETCH FIRST 20 ROWS ONLY;
```

### 2단계: 실행계획
```sql
EXPLAIN PLAN FOR <SQL>;
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);
```

### 3단계: 인덱스 추가
- FK 컬럼에 인덱스 누락 흔함
- 자주 쓰는 WHERE 조건 컬럼

### 4단계: 통계 갱신
```sql
EXEC DBMS_STATS.GATHER_TABLE_STATS('DATABANK', 'TABLE_NAME');
```

## 3. ORA-00955 (이미 존재)

스키마 초기화 시 정상 — `ensureXxxSchema`가 swallow한다. 그러나:
- `MIGRATION_DDL`에서 의도하지 않은 swallow가 있을 수 있다
- 신규 테이블이 안 만들어졌으면: `SELECT * FROM USER_TABLES WHERE TABLE_NAME='X'`로 확인 후 수동 DROP/재실행

## 4. ORA-00001 (Unique constraint)

- 클라이언트는 409 `CONFLICT` 응답 받음
- 어느 제약? `USER_INDEXES`, `USER_CONSTRAINTS`로 확인
- 기존 데이터 정리 후 재시도

## 5. ORA-02292 (Integrity constraint child record)

- 부모 row 삭제 시 자식 있음
- DataBank는 소프트 삭제 권장 — `ENABLED=0` 처리
- 진짜 DELETE 필요하면 자식부터

## 6. CLOB 처리 오류

증상: 응답에 `[object Object]` 또는 Lob 직렬화 오류.

원인: Repository에서 `clobFetchHandler` 미적용.

대응: Repository SELECT 호출에 `fetchTypeHandler: clobFetchHandler` 옵션 추가.

```javascript
const result = await connection.execute(sql, binds, {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
  fetchTypeHandler: clobFetchHandler,
});
```

## 7. 한글 깨짐

- DB 캐릭터셋 확인: `SELECT * FROM NLS_DATABASE_PARAMETERS WHERE PARAMETER='NLS_CHARACTERSET'` → `AL32UTF8`이어야 함
- 클라이언트 NLS_LANG: `KOREAN_KOREA.AL32UTF8`
- VARCHAR2 단위가 BYTE면 잘림 — `VARCHAR2(N CHAR)`로 변경

## 8. 트랜잭션 누수

증상: 변경이 커밋 안 됨 또는 다른 트랜잭션 블록.

대응:
- `withConnection`은 commit 명시 필요 — 트랜잭션이면 `withTransaction` 사용
- 라우트에서 `await connection.commit()` 누락 점검

## 관련
- [../architecture/backend.md](../architecture/backend.md)
- [../architecture/database.md](../architecture/database.md)
- [../guides/ddl-migration.md](../guides/ddl-migration.md)
