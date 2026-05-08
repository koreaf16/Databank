# DataBank 시스템 문서

DataBank Slack은 사내 업무 통합 플랫폼이다. 이 디렉토리는 시스템의 모든 공식 문서를 모은 곳이다.

## 디렉토리 구성

```
docs/
├── architecture/   시스템 전체 구조와 표준
├── modules/        9개 메뉴별 기술서
├── guides/         개발자 작업 안내
├── runbooks/       운영/장애 대응 절차
└── chat/           홈·채널 현행화, 트렌드 일반화, AI 연결 계획
```

## 빠른 진입점

### 처음 보는 분
1. [architecture/overview.md](architecture/overview.md) — 시스템 전체 그림 한 페이지
2. [guides/local-setup.md](guides/local-setup.md) — 로컬 환경 구성
3. [architecture/coding-standards.md](architecture/coding-standards.md) — 코드 작성 규칙

### 새 메뉴/기능을 추가하려는 분
1. [guides/adding-new-menu.md](guides/adding-new-menu.md) — 표준 절차
2. [architecture/api-conventions.md](architecture/api-conventions.md) — API 응답 규약
3. [architecture/database.md](architecture/database.md) — 테이블 카탈로그
4. [guides/ddl-migration.md](guides/ddl-migration.md) — 스키마 변경 절차

### 홈·채널/트렌드/AI 현행화
1. [chat/00-architecture.md](chat/00-architecture.md) — 전체 아키텍처
2. [chat/04-critical-review.md](chat/04-critical-review.md) — 구현 전 현실성 보정
3. [chat/99-verification.md](chat/99-verification.md) — 단계별 검증 시나리오

### 메뉴 동작/데이터를 알고 싶은 분
- [modules/home/README.md](modules/home/README.md) — 홈
- [modules/calendar/README.md](modules/calendar/README.md) — 일정관리
- [modules/support-history/README.md](modules/support-history/README.md) — 지원이력
- [modules/knowledge-base/README.md](modules/knowledge-base/README.md) — 지식베이스
- [modules/weekly-report/README.md](modules/weekly-report/README.md) — 주간업무보고
- [modules/matrix/README.md](modules/matrix/README.md) — 작업현황표
- [modules/organization/README.md](modules/organization/README.md) — 조직도
- [modules/customers/README.md](modules/customers/README.md) — 고객사 통합 관리
- [modules/settings/README.md](modules/settings/README.md) — 관리설정

### 운영자
- [runbooks/oracle-troubleshooting.md](runbooks/oracle-troubleshooting.md) — Oracle 장애 대응
- [runbooks/pdf-render-failure.md](runbooks/pdf-render-failure.md) — PDF 렌더 실패 대응

### 의사결정 기록
- [architecture/adr/](architecture/adr/) — Architecture Decision Records

## 문서 작성 규칙

- 한국어 우선. 식별자(테이블명, 함수명, 환경변수)만 영문 그대로.
- 메뉴별 README는 8섹션(개요/UX/데이터/API/프론트/로직/의존/이슈) 표준 준수.
- 코드 인용은 `파일경로:라인번호` 형식으로 출처 명시.
- 변경 이력은 git 커밋 메시지로 추적(문서 내 "최종 수정일" 같은 항목 두지 않음).
