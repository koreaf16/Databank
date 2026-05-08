# 한글 처리 가이드

DataBank는 한국어 우선 시스템이다. UI/메시지/주석은 한국어, 식별자는 영문.

## 인코딩

- DB: `AL32UTF8`(또는 UTF-8 호환)
- Node.js: 기본 UTF-8
- HTTP: `Content-Type: ...; charset=utf-8`
- 파일 저장: BOM 없는 UTF-8

## 컬럼 길이

`VARCHAR2(N CHAR)` 단위 강제. BYTE 단위면 한글 한 자가 2~3바이트로 잘린다.

```sql
-- 안 좋은 예
NAME VARCHAR2(200)         -- 기본 BYTE 단위 (NLS_LENGTH_SEMANTICS=BYTE인 경우)

-- 좋은 예
NAME VARCHAR2(200 CHAR)
```

길이 가이드:
- 사람 이름: 200 CHAR (외국인/긴 한자 이름 대응)
- 부서/팀/고객사 이름: 200~300 CHAR
- 제목/요약: 300~500 CHAR
- 본문: CLOB

## 검색

### 단순 일치(권장)
```sql
WHERE LOWER(NAME) LIKE '%' || LOWER(:q) || '%'
```
- 인덱스 미사용(테이블 스캔) — 데이터 양이 수천~수만 행 정도면 충분
- 정확도 낮음(한글 형태소 분석 없음)

### Oracle Text(필요 시)
```sql
CREATE INDEX IDX_TEXT_NAME ON TABLE_X(NAME) INDEXTYPE IS CTXSYS.CONTEXT;

WHERE CONTAINS(NAME, :q) > 0
```
- 형태소 분석 가능
- 인덱스 동기화 부담
- 본 시스템은 후순위(데이터 양 적음)

## 정렬

### 클라이언트 정렬(권장)
```javascript
items.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
```
- 한국어 가나다 순 자동
- DB 부하 없음
- 페이지당 N건만 정렬하므로 충분

### Oracle NLS 정렬(특수 상황)
```sql
SELECT * FROM TABLE_X ORDER BY NAME
ALTER SESSION SET NLS_SORT = 'KOREAN_M';
```
- 풀 테이블 정렬 시 사용
- 세션 단위 설정

## 시각

- 저장: `SYSTIMESTAMP`(서버 타임존)
- 표시: 클라이언트 `toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', ... })`
- KST/UTC ADR 결정 후 통일 — 현재는 KST 기준

## 메시지

- 에러 message: 한국어 ("부서 이름은 필수입니다")
- 에러 code: 영문 (`VALIDATION_ERROR`)
- 클라이언트가 code로 분기, message로 사용자 표시

## UI 텍스트

- 컴포넌트 안 하드코딩 한국어 OK (현재 i18n 도입 안 함)
- 미래 i18n 도입 시 `t('home.kpi.thisWeek')` 키 표준은 별도 ADR

## 한글 정규화 주의

- 자모 분리/결합(NFC vs NFD)이 다른 OS에서 발생 가능 — 검색 전 `String.prototype.normalize('NFC')` 권장
- 윈도우 파일명은 NFC, macOS는 NFD가 기본 → 파일 업로드 시 normalize 후 비교

## .env / 설정 파일의 한글

- 가능하면 ENV 값에 한글 회피 (`#` 같은 특수문자도 따옴표 필요)
- 코드 내 한글 상수는 OK

## 식별자 규칙(재확인)

- 테이블/컬럼: 영문 SNAKE_CASE
- 함수/변수: 영문 camelCase
- 한국어 식별자 금지(IDE/툴/import 호환성)

## 관련
- [../architecture/coding-standards.md](../architecture/coding-standards.md)
- [../architecture/database.md](../architecture/database.md)
