# 로컬 환경 구성

처음 DataBank를 받아서 띄우는 절차.

## 사전 준비

| 항목 | 권장 |
|---|---|
| Node.js | 20 LTS 이상 |
| Oracle DB | 19c 또는 XE 21c |
| Chrome / Chromium | PDF 렌더용(없어도 다른 기능 동작) |
| Git | 최신 |

## Oracle 준비

### 옵션 A: 로컬 Oracle XE 21c
```
docker run -d --name oracle-xe \
  -p 1521:1521 -p 5500:5500 \
  -e ORACLE_PWD=YourStrongPwd1 \
  -e ORACLE_CHARACTERSET=AL32UTF8 \
  container-registry.oracle.com/database/express:21.3.0-xe
```
- 사용자 생성: `CREATE USER databank IDENTIFIED BY <pwd>; GRANT CONNECT, RESOURCE, UNLIMITED TABLESPACE TO databank;`

### 옵션 B: 사내 Oracle 19c
- DBA에게 사용자 권한 요청(CONNECT, RESOURCE, 본인 스키마 DDL 권한)

## 환경변수

`backend/.env` 파일 생성:

```
PORT=7001
ORACLE_USER=databank
ORACLE_PASSWORD=<password>
ORACLE_CONNECT_STRING=localhost:1521/XEPDB1
ORACLE_POOL_MIN=1
ORACLE_POOL_MAX=4
```

## 설치 + 실행

```bash
git clone <repo>
cd Databank
npm install                # workspaces 설치

# 스키마 초기화
cd backend && npm run init:schema && cd ..

# 동시 실행
npm run dev
```

브라우저 열기: http://localhost:7000

## 초기 데이터

본 시스템은 **빈 테이블 + UI 입력** 정책. seed 스크립트 없음. 화면에서 직접 등록.

순서 권장:
1. 관리설정 → 서비스 마스터 등록
2. 조직도 → 부서/사용자 등록
3. 고객사 통합 관리 → 고객사 + 별칭 + 담당자
4. 일정/지원이력/지식베이스 등 도메인 데이터

## 문제 해결

| 증상 | 대응 |
|---|---|
| `ORACLE_UNAVAILABLE` 503 | `.env` 값 확인, `tnsping` 또는 `sqlplus`로 직접 연결 시도 |
| Vite 7000 포트 충돌 | `frontend/vite.config.*`의 server.port 수정 |
| Express 7001 포트 충돌 | `.env`의 `PORT=` 변경 |
| PDF 렌더 실패 | [../runbooks/pdf-render-failure.md](../runbooks/pdf-render-failure.md) |
| 한글 깨짐 | NLS_LANG 또는 클라이언트 인코딩 확인 |

## 관련
- [../architecture/deployment.md](../architecture/deployment.md)
- [ddl-migration.md](ddl-migration.md)
