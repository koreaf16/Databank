# 지식베이스 (Knowledge Base)

`nav='kb'` — 운용 매뉴얼·런북·점검항목·교육자료 등 사내 기술 문서 카탈로그.

## 1. 메뉴 개요

- 사용자: 엔지니어(검색/열람), 매니저/저자(등록/수정)
- 책임: 카테고리 트리, 문서 등록·검색·인덱싱(임베딩) 진행률 표시
- 문서 분류: runbook, check_item, training (등 확장 가능)

## 2. 화면/UX 흐름

1. 진입 → 좌측 카테고리 트리, 우측 문서 카드
2. 카테고리 클릭 → 자손 카테고리 포함 문서 목록(`CONNECT BY PRIOR`)
3. 검색바 → 제목/요약/태그 검색(쿼리 `q`)
4. 필터: docType, productName, version, osPlatform, vendor
5. 문서 카드 → 상세 메타 + 인덱싱 진행 배지
6. "신규 등록" → 카테고리 선택 + 메타 입력 모달
7. 인덱싱 진행률은 폴링 또는 SSE(추후)

## 3. 데이터 모델

```sql
KB_CATEGORIES (
  CATEGORY_ID VARCHAR2(40 CHAR) NOT NULL,
  PARENT_CATEGORY_ID VARCHAR2(40 CHAR),
  NAME VARCHAR2(200 CHAR) NOT NULL,
  ICON VARCHAR2(40 CHAR),
  SORT_ORDER NUMBER DEFAULT 0 NOT NULL,
  ENABLED NUMBER(1) DEFAULT 1 NOT NULL,
  CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT PK_KB_CATEGORIES PRIMARY KEY (CATEGORY_ID),
  CONSTRAINT FK_KBC_PARENT FOREIGN KEY (PARENT_CATEGORY_ID) REFERENCES KB_CATEGORIES(CATEGORY_ID)
)

KB_DOCUMENTS (
  DOCUMENT_ID VARCHAR2(40 CHAR) NOT NULL,
  CATEGORY_ID VARCHAR2(40 CHAR) NOT NULL,
  TITLE VARCHAR2(300 CHAR) NOT NULL,
  DOC_TYPE VARCHAR2(40 CHAR),                       -- runbook | check_item | training
  SERVICE_MASTER_ID VARCHAR2(40 CHAR),
  PRODUCT_NAME VARCHAR2(200 CHAR),
  VERSION_RANGE VARCHAR2(100 CHAR),
  OS_PLATFORM VARCHAR2(100 CHAR),
  VENDOR VARCHAR2(100 CHAR),
  AUTHOR_USER_ID NUMBER,
  SUMMARY VARCHAR2(2000 CHAR),
  STATUS VARCHAR2(20 CHAR) DEFAULT 'ready' NOT NULL,-- ready | indexing
  CHUNKS NUMBER DEFAULT 0,
  VECTORS NUMBER DEFAULT 0,
  INDEX_STATUS VARCHAR2(40 CHAR),
  INDEX_PROGRESS NUMBER,
  INDEX_STAGE VARCHAR2(40 CHAR),
  INDEX_MODEL VARCHAR2(80 CHAR),
  INDEX_MESSAGE VARCHAR2(500 CHAR),
  INDEX_UPDATED_AT TIMESTAMP,
  CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT PK_KB_DOCUMENTS PRIMARY KEY (DOCUMENT_ID),
  CONSTRAINT FK_KBD_CATEGORY FOREIGN KEY (CATEGORY_ID) REFERENCES KB_CATEGORIES(CATEGORY_ID)
)

KB_DOCUMENT_TAGS (
  DOCUMENT_ID VARCHAR2(40 CHAR) NOT NULL,
  TAG VARCHAR2(80 CHAR) NOT NULL,
  CONSTRAINT PK_KB_DOC_TAGS PRIMARY KEY (DOCUMENT_ID, TAG),
  CONSTRAINT FK_KBT_DOC FOREIGN KEY (DOCUMENT_ID) REFERENCES KB_DOCUMENTS(DOCUMENT_ID) ON DELETE CASCADE
)

KB_DOCUMENT_VERSIONS (
  DOCUMENT_ID VARCHAR2(40 CHAR) NOT NULL,
  VERSION VARCHAR2(40 CHAR) NOT NULL,
  CONSTRAINT PK_KB_DOC_VERSIONS PRIMARY KEY (DOCUMENT_ID, VERSION),
  CONSTRAINT FK_KBV_DOC FOREIGN KEY (DOCUMENT_ID) REFERENCES KB_DOCUMENTS(DOCUMENT_ID) ON DELETE CASCADE
)
```

자기참조 트리(`KB_CATEGORIES.PARENT_CATEGORY_ID`)는 Oracle `CONNECT BY PRIOR`로 자손 조회.

## 4. API 엔드포인트

| 메서드 | 경로 | 비고 |
|---|---|---|
| GET | `/api/kb/categories` | 트리 전체 |
| POST | `/api/kb/categories` | 등록 |
| PATCH | `/api/kb/categories/:id` | 수정 |
| GET | `/api/kb/documents?categoryId=&q=&docType=&version=&...` | 자손 카테고리 포함 |
| GET | `/api/kb/documents/:id` | 상세 |
| POST | `/api/kb/documents` | 등록(DOC + TAGS + VERSIONS 트랜잭션) |
| PATCH | `/api/kb/documents/:id` | 수정 |
| GET | `/api/kb/documents/:id/indexing` | 인덱싱 진행률 |
| POST | `/api/kb/documents/:id/reindex` | 재인덱스 큐잉 |

## 5. 프론트엔드 모듈 구성

```
features/knowledge-base/
├── api/kbApi.js
├── components/
│   ├── KnowledgeBasePage.jsx
│   ├── KbCategoryTree.jsx
│   ├── KbCategoryNode.jsx
│   ├── KbDocCard.jsx
│   ├── KbDocDetail.jsx
│   ├── KbRegisterModal.jsx
│   └── badges/
│       ├── IndexStatus.jsx
│       ├── DocTypeBadge.jsx
│       └── VersionMatchBadge.jsx
└── hooks/
    └── useKbDocuments.js
```

## 6. 주요 비즈니스 로직

- **자손 카테고리 조회**:
  ```sql
  SELECT CATEGORY_ID FROM KB_CATEGORIES
  START WITH CATEGORY_ID = :rootId
  CONNECT BY PRIOR CATEGORY_ID = PARENT_CATEGORY_ID
  ```
- **검색**: TITLE/SUMMARY/TAG ILIKE 결합 + LOWER 비교(한국어 고려: 단순 LOWER 일치로 충분, Oracle Text는 후순위)
- **인덱싱**: 본 단계는 mock 진행률(STATUS, PROGRESS 컬럼만 갱신). 실제 임베딩 큐는 별도 작업
- **버전 매칭**: VERSION_RANGE(예: "12c-19c") 파싱은 클라이언트 도메인 함수에서

## 7. 의존성

- 1.9 관리설정의 SERVICE_MASTER(SERVICE_MASTER_ID 참조)
- 1.7 조직도(AUTHOR_USER_ID)

## 8. 운영 시 알려진 이슈 / TODO

- 현재 server.js의 `categories/documents`는 인메모리 — Oracle 전환 필요
- `descendantCategoryIds`(현 server.js:458)을 SQL CONNECT BY로 옮기면 메모리 부담 해소
- 실제 임베딩(벡터) 인덱싱은 본 계획 범위 외 — STATUS/PROGRESS 골격만 유지
- 한글 검색 정밀도 필요 시 Oracle Text 인덱스 도입 검토

## 관련 파일
- 현재: `backend/src/server.js:321-407` 인메모리 라우트, `frontend/src/data.js`의 `window.KB_CATEGORIES/KB_DOCUMENTS`, `frontend/src/components/Pages.jsx:795-1366`
- 신규: `backend/src/modules/knowledge-base/`, `frontend/src/features/knowledge-base/`
