# DATABANK Mockup System

`deisgn.zip`의 React 목업을 Node.js 기반 프로젝트로 분리한 구조입니다.

## Structure

- `frontend/`: Vite + React 목업 UI
- `backend/`: Express 기반 목업 API
- `deisgn.zip`: 원본 디자인 압축 파일

## Commands

```bash
npm install
npm run dev
```

기본 주소:

- Frontend: `http://127.0.0.1:7000`
- Backend: `http://127.0.0.1:7001`

API 예시:

- `GET /api/health`
- `GET /api/mock/summary`
- `GET /api/mock/navigation`
- `GET /api/mock/activity`
- `GET /api/kb/categories`
- `GET /api/kb/documents?categoryId=&serviceMasterId=&version=&status=`
- `POST /api/kb/documents`
- `GET /api/kb/documents/:id/indexing`
- `POST /api/kb/documents/:id/reindex`

## Oracle Org/Customer Sync

Backend now supports Oracle-based sync for organization/users/customers.

Environment variables:

- `DATABASE_URL` (example: `192.168.0.120:1521/AI_DB`)
- `DATABASE_USER`
- `DATABASE_PASSWORD`

Run once to create tables:

```bash
npm run init:schema -w backend
```

Run sync from CSV:

```bash
npm run sync:org-customers -w backend
```

Optional arguments:

- `--users <path>`
- `--customers <path>`
- `--encoding <encoding>` (default: `cp949`)
- `--root <root department name>` (default: `데이타뱅크시스템즈`)

New APIs:

- `GET /api/org/departments`
- `GET /api/org/users`
- `GET /api/customers`
