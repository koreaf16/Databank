# 지원이력 (Support History)

`nav='hist'` — 고객사 지원 활동 기록(점검/기술지원/장애대응)과 가동률 분석.

## 1. 메뉴 개요

- 사용자: 엔지니어(등록), 매니저(검토/일괄 변경)
- 책임: 지원 활동 등록·조회·수정·삭제, 일괄 상태 변경, 엔지니어별 가동률 집계
- ID 형식: `H-XXXXXX`(외부에 노출되는 식별자)

## 2. 화면/UX 흐름

1. 진입 → 최근 N건 목록(필터: 고객사, 엔지니어, 기간, 유형, 방식, 검색어)
2. "신규 등록" → 등록 모달(고객사, 서비스, 유형, 방식, 출발/지원/복귀 시간, 작업 내용, 발견 사항, 조치 결과, 참여자)
3. 행 클릭 → 상세 모달(편집 가능)
4. 다중 선택 → 일괄 STATUS 변경, 매니저 일괄 재배정
5. 가동률 탭 → 엔지니어별/팀별/기간별 그래프

## 3. 데이터 모델

```sql
SUPPORT_HISTORIES (
  HISTORY_ID VARCHAR2(40 CHAR) NOT NULL,            -- 'H-XXXXXX'
  CUSTOMER_ID NUMBER NOT NULL,
  SERVICE_NAME VARCHAR2(200 CHAR),
  HISTORY_TYPE VARCHAR2(20 CHAR) NOT NULL,           -- routine | tech | incident
  SUPPORT_MODE VARCHAR2(20 CHAR) NOT NULL,           -- onsite | remote
  STATUS VARCHAR2(20 CHAR) DEFAULT 'draft' NOT NULL, -- draft | progress | done | review
  PRIORITY VARCHAR2(4 CHAR),                         -- p1..p4
  SUMMARY VARCHAR2(500 CHAR),
  WORK_DETAIL CLOB,
  FINDING CLOB,
  ACTION_RESULT CLOB,
  DEPARTURE_AT TIMESTAMP,
  SUPPORT_STARTED_AT TIMESTAMP,
  SUPPORT_ENDED_AT TIMESTAMP,
  RETURN_AT TIMESTAMP,
  CREATED_BY NUMBER,
  CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT PK_SUPPORT_HISTORIES PRIMARY KEY (HISTORY_ID),
  CONSTRAINT FK_SH_CUSTOMER FOREIGN KEY (CUSTOMER_ID) REFERENCES CUSTOMERS(CUSTOMER_ID),
  CONSTRAINT FK_SH_USER FOREIGN KEY (CREATED_BY) REFERENCES USERS(USER_ID)
)

SUPPORT_HISTORY_PARTICIPANTS (
  HISTORY_ID VARCHAR2(40 CHAR) NOT NULL,
  USER_ID NUMBER NOT NULL,
  IS_MANAGER NUMBER(1) DEFAULT 0 NOT NULL,
  CONSTRAINT PK_SHP PRIMARY KEY (HISTORY_ID, USER_ID),
  CONSTRAINT FK_SHP_HIST FOREIGN KEY (HISTORY_ID) REFERENCES SUPPORT_HISTORIES(HISTORY_ID) ON DELETE CASCADE,
  CONSTRAINT FK_SHP_USER FOREIGN KEY (USER_ID) REFERENCES USERS(USER_ID)
)
```

인덱스 후보: `SUPPORT_HISTORIES(CUSTOMER_ID)`, `(SUPPORT_STARTED_AT)`, `(STATUS)`, `(CREATED_BY)`.

## 4. API 엔드포인트

| 메서드 | 경로 | 비고 |
|---|---|---|
| GET | `/api/support-history?customerId=&engineerId=&from=&to=&type=&method=&q=&page=&pageSize=` | 페이징 응답 |
| GET | `/api/support-history/:id` | 상세 |
| POST | `/api/support-history` | 등록(HISTORY + PARTICIPANTS 트랜잭션) |
| PATCH | `/api/support-history/:id` | 수정 |
| DELETE | `/api/support-history/:id` | 소프트 삭제 |
| POST | `/api/support-history/bulk` | 일괄 STATUS 변경 또는 매니저 재배정 |

## 5. 프론트엔드 모듈 구성

```
features/support-history/
├── api/historyApi.js
├── components/
│   ├── SupportHistoryPage.jsx
│   ├── HistoryRegisterModal.jsx
│   ├── HistoryDetailModal.jsx
│   ├── HistDetailBlock.jsx
│   ├── ParticipantStack.jsx
│   └── UtilizationView.jsx
├── domain/
│   ├── historyDomain.js          # normalizeSupportHistoryList 등
│   └── utilization.js            # 가동률 계산
└── hooks/
    └── useSupportHistory.js
```

## 6. 주요 비즈니스 로직

- **가동률(utilization)**: 사용자별 `(SUPPORT_ENDED_AT - SUPPORT_STARTED_AT)` 합 ÷ 가동 가능 시간(주 5일 × 8시간 등 — 기준 정의 필요)
- **타임라인**: `DEPARTURE_AT → SUPPORT_STARTED_AT → SUPPORT_ENDED_AT → RETURN_AT` 순서. 누락 시 그레이스 처리
- **참여자 다중 INSERT**: HISTORY 생성 + 참여자 N건 한 트랜잭션
- **일괄 변경**: 단일 `withTransaction` 안에서 다건 UPDATE

## 7. 의존성

- 1.7 조직도(CREATED_BY, PARTICIPANTS)
- 1.8 고객사(CUSTOMER_ID)
- 1.6 작업현황표가 SUPPORT_HISTORIES 등록 시 ROUTINE_PLAN_CELLS.STATUS='done' 자동 갱신(서비스 레이어)
- 1.5 주간업무보고가 본 데이터 인용(이번 주 실적)

## 8. 운영 시 알려진 이슈 / TODO

- 가동률 계산을 프론트에 둘지 백엔드로 옮길지 결정 필요(현재 프론트 유지 권장)
- CSV 내보내기는 본 단계 범위 외
- HISTORY_ID 'H-XXXXXX' 생성 정책 — 시퀀스+포맷 또는 IDENTITY 후 prefix 가공 결정 필요
- WORK_DETAIL CLOB가 매우 길어질 가능성 → 검색 시 본문 인덱싱(Oracle Text) 후순위

## 관련 파일
- 현재(Phase 0 이전): `frontend/src/components/Pages.jsx` 153-794줄, `frontend/src/supportHistory.js`, `frontend/src/data.js`의 `window.HISTORY`
- 신규: `backend/src/modules/support-history/`, `frontend/src/features/support-history/`
