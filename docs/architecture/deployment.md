# 배포 / 실행

DataBank는 모노레포(`backend/` + `frontend/`)이고 루트 `package.json`이 `concurrently`로 둘을 동시에 띄운다.

## 포트

| 컴포넌트 | 포트 | 비고 |
|---|---|---|
| Frontend (Vite dev) | 7000 | `frontend/vite.config.*` |
| Backend (Express) | 7001 | `backend/src/server.js` |

## 환경변수 (Backend)

`backend/.env` 또는 OS 환경변수로 설정.

| 키 | 용도 | 예시 |
|---|---|---|
| `PORT` | Express 포트 | `7001` |
| `ORACLE_USER` | Oracle 사용자 | `databank` |
| `ORACLE_PASSWORD` | Oracle 비밀번호 | `***` |
| `ORACLE_CONNECT_STRING` | TNS 또는 EZCONNECT | `localhost:1521/XEPDB1` |
| `ORACLE_POOL_MIN` | 풀 최소 | `1` (기본) |
| `ORACLE_POOL_MAX` | 풀 최대 | `4` (기본) |
| `CHROME_PATH` | PDF 렌더용 Chrome 경로 | (선택, 자동 탐색) |

`config/env.js`에서 누락 시 기동 거부 또는 Oracle 미연결 모드(`/api/health`만 응답)로 진입.

## 환경변수 (Frontend)

브라우저에서 `window.DATABANK_API_BASE`(`shared/api/apiBase.js`에서 단일 책임)로 백엔드 주소를 넘긴다. 기본 `http://127.0.0.1:7001`.

## 빌드 / 실행

```bash
# 루트
npm install                # workspaces 동시 설치
npm run dev                # concurrently — frontend(7000) + backend(7001)

# 개별
cd backend && npm start    # Express
cd frontend && npm run dev # Vite

# 프론트 빌드
cd frontend && npm run build
```

## 스키마 초기화

```bash
cd backend
npm run init:schema        # scripts/initSchema.js — 모든 ensureXxxSchema 실행
```

ORA-00955(이미 존재)는 swallow. 컬럼 추가는 `MIGRATION_DDL` 배열에 적힌 ALTER 문 try/catch로 무시.

## PDF 렌더

- `infra/pdf/chromeRenderer.js`가 `chrome --headless` 호출
- Windows: `findChromeExecutable`이 표준 설치 경로 검색
- Linux 운영 시: `CHROME_PATH=/usr/bin/google-chrome` 같은 식으로 명시

## 헬스체크

```
GET /api/health
→ { "ok": true, "data": { "oracle": "ok|down", "uptime": <sec> } }
```

## 관련 문서
- [../guides/local-setup.md](../guides/local-setup.md) — Oracle XE/19c 로컬 띄우기
- [../runbooks/oracle-troubleshooting.md](../runbooks/oracle-troubleshooting.md)
- [../runbooks/pdf-render-failure.md](../runbooks/pdf-render-failure.md)
