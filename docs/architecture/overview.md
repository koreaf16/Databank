# 시스템 개요

DataBank Slack은 사내 엔지니어 조직의 업무 흐름(고객 지원, 일정, 보고서, 지식)을 한 화면에 모은 통합 플랫폼이다.

## 한 페이지 구성도

```
+------------------+       HTTP        +-----------------+        Oracle 19c
|                  |   (포트 7000)     |                 |   (TNS / EZCONNECT)
|  React 18 + Vite |  ───────────────▶ |  Express 4.21   |  ──────────────────▶  Oracle DB
|                  |                   |  (포트 7001)    |
+------------------+                   +-----------------+
       │                                       │
       │  features/<menu>/                     │  modules/<도메인>/
       │  shared/                              │  infra/oracle/
       │  layout/                              │  http/
       │                                       │
       ▼                                       ▼
   브라우저                                   PDF 렌더
   (Chrome/Edge)                              (chrome --headless)
```

## 9개 메뉴 매트릭스

| 메뉴 | nav 코드 | 핵심 테이블 | 의존 메뉴 |
|---|---|---|---|
| 홈 | home | (집계 전용) | 모든 메뉴 |
| 일정관리 | cal | EVENTS, EVENT_PARTICIPANTS, ATTENDANCE_NOTICES | 조직, 고객사 |
| 지원이력 | hist | SUPPORT_HISTORIES, SUPPORT_HISTORY_PARTICIPANTS | 조직, 고객사 |
| 지식베이스 | kb | KB_CATEGORIES, KB_DOCUMENTS, KB_DOCUMENT_TAGS, KB_DOCUMENT_VERSIONS | (없음) |
| 주간업무보고 | rep | WEEKLY_REPORTS, WEEKLY_REPORT_ITEMS, TEAMS, REPORT_MASTER_TEMPLATES | 일정, 지원이력 |
| 작업현황표 | mat | ROUTINE_PLANS, ROUTINE_PLAN_CELLS | 지원이력, 고객사 |
| 조직도 | org | DEPARTMENTS, USERS, POSITIONS | (없음) |
| 고객사 통합 관리 | cust | CUSTOMERS, CUSTOMER_ALIASES, CUSTOMER_ASSIGNMENTS | 조직 |
| 관리설정 | set | SERVICE_MASTER, CHECKLISTS, AI_*, RBAC_*, AUDIT_LOG, REPORT_MASTER_TEMPLATES | (없음) |

## 진행 단계

| Phase | 목표 | 결과물 |
|---|---|---|
| Phase 0 | 공통 기반 마련 | 디렉토리 골격, 공통 유틸, API envelope, Pages.jsx 분해, docs 골격 |
| Phase 1 | 9개 메뉴 수직 완성 | 메뉴별 DDL → Repository → API → 프론트 API 클라이언트 → UI 연결 → 기술서 |
| Phase 2 | 통합 검증·정리 | end-to-end 시나리오, 회귀 점검, dead code 삭제 |

## 진행 순서 결정 사유

- **Phase 0 먼저**: 메뉴별로 흩어지면 패턴이 어긋난다. 공통 골격을 먼저 확정.
- **이미 동작 중인 1.7 조직도 / 1.8 고객사 표준화 우선**: 신규 메뉴들이 따라갈 패턴 확정.
- **1.1 홈은 마지막**: 집계 대상 메뉴 데이터가 없으면 KPI가 0뿐.

## 관련 문서

- [backend.md](backend.md), [frontend.md](frontend.md), [database.md](database.md)
- [api-conventions.md](api-conventions.md), [coding-standards.md](coding-standards.md), [deployment.md](deployment.md)
- [adr/](adr/)
