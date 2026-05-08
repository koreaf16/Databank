/**
 * 파일: backend/src/modules/knowledge-base/schema/kbChunkSchema.ts
 * 역할: RAG 파이프라인 관련 테이블 DDL.
 *       KB_DOCUMENT_FILES(원본 BLOB), KB_DOCUMENT_CHUNKS(청크+벡터),
 *       KB_INDEX_JOBS(인덱싱 큐), KB_CRAWL_CANDIDATES(URL 크롤링 후보, Stage 2),
 *       KB_SEARCH_QUERIES(검색 로그).
 *
 * 연관 파일:
 *   - schema/kbSchema.ts              : KB_DOCUMENTS FK 참조
 *   - repository/kbFileRepository.ts  : BLOB 저장/조회
 *   - repository/kbChunkRepository.ts : 청크 insert + 벡터 검색
 *   - repository/kbJobRepository.ts   : 인덱싱 큐 관리
 *   - server.ts                       : ensureKbChunkSchema 호출
 */

import { isAlreadyExists } from '../../../infra/oracle/errorCodes.js';

const DDL = [
  // ── 1. 원본 파일 메타 + SecureFiles BLOB ────────────────────────────────────
  `
    CREATE TABLE KB_DOCUMENT_FILES (
      FILE_ID        VARCHAR2(40 CHAR)    NOT NULL,
      DOC_ID         VARCHAR2(40 CHAR)    NOT NULL,
      FILE_NAME      VARCHAR2(500 CHAR)   NOT NULL,
      MIME_TYPE      VARCHAR2(100 CHAR),
      SIZE_BYTES     NUMBER,
      SHA256         VARCHAR2(64 CHAR),
      PAGE_COUNT     NUMBER,
      EXTRACTED_AT   TIMESTAMP,
      PARSER_NAME    VARCHAR2(50 CHAR),
      CONTENT_BLOB   BLOB,
      PREVIEW_TEXT   CLOB,
      CREATED_AT     TIMESTAMP  DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT PK_KB_DOC_FILES PRIMARY KEY (FILE_ID),
      CONSTRAINT FK_KDF_DOC FOREIGN KEY (DOC_ID)
        REFERENCES KB_DOCUMENTS(DOC_ID) ON DELETE CASCADE
    ) LOB (CONTENT_BLOB) STORE AS SECUREFILE (
      COMPRESS HIGH
      DEDUPLICATE
      CACHE
    )
  `,
  `CREATE INDEX IDX_KDF_DOC ON KB_DOCUMENT_FILES (DOC_ID, CREATED_AT)`,

  // ── 2. 청크 + 벡터 (Oracle 26ai VECTOR) ────────────────────────────────────
  `
    CREATE TABLE KB_DOCUMENT_CHUNKS (
      CHUNK_ID         VARCHAR2(40 CHAR)    NOT NULL,
      DOC_ID           VARCHAR2(40 CHAR)    NOT NULL,
      FILE_ID          VARCHAR2(40 CHAR),
      ORDINAL          NUMBER               NOT NULL,
      HEADING_PATH     VARCHAR2(1000 CHAR),
      PAGE_FROM        NUMBER,
      PAGE_TO          NUMBER,
      TOKEN_COUNT      NUMBER,
      CONTENT_TEXT     CLOB                 NOT NULL,
      CONTEXT_PREFIX   VARCHAR2(2000 CHAR),
      EMBEDDING        VECTOR(1024, FLOAT32),
      EMBEDDING_MODEL  VARCHAR2(100 CHAR),
      LANG             VARCHAR2(10 CHAR)    DEFAULT 'ko',
      CREATED_AT       TIMESTAMP  DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT PK_KB_CHUNKS PRIMARY KEY (CHUNK_ID),
      CONSTRAINT FK_KBC_DOC  FOREIGN KEY (DOC_ID)
        REFERENCES KB_DOCUMENTS(DOC_ID) ON DELETE CASCADE,
      CONSTRAINT FK_KBC_FILE FOREIGN KEY (FILE_ID)
        REFERENCES KB_DOCUMENT_FILES(FILE_ID) ON DELETE SET NULL
    )
  `,
  `CREATE INDEX IDX_KBC_DOC  ON KB_DOCUMENT_CHUNKS (DOC_ID, ORDINAL)`,
  `CREATE INDEX IDX_KBC_FILE ON KB_DOCUMENT_CHUNKS (FILE_ID)`,
  // Oracle Text Index with Korean Morphological Lexer
  // Note: Preference creation is handled in ensureKbChunkSchema
  `CREATE INDEX IDX_KBC_TEXT ON KB_DOCUMENT_CHUNKS (CONTENT_TEXT)
     INDEXTYPE IS CTXSYS.CONTEXT
     PARAMETERS ('LEXER KB_KOREAN_LEXER SYNC (MANUAL)')`,
  `CREATE VECTOR INDEX IDX_KBC_VEC ON KB_DOCUMENT_CHUNKS (EMBEDDING)
     ORGANIZATION INMEMORY NEIGHBOR GRAPH
     DISTANCE COSINE
     WITH TARGET ACCURACY 90
     PARAMETERS (TYPE HNSW, NEIGHBORS 32, EFCONSTRUCTION 200)`,

  // ── 3. 인덱싱 작업 큐 ────────────────────────────────────────────────────────
  `
    CREATE TABLE KB_INDEX_JOBS (
      JOB_ID        VARCHAR2(40 CHAR)   NOT NULL,
      DOC_ID        VARCHAR2(40 CHAR),
      KIND          VARCHAR2(30 CHAR)   NOT NULL,
      PAYLOAD_JSON  CLOB,
      STATUS        VARCHAR2(20 CHAR)   DEFAULT 'queued' NOT NULL,
      ATTEMPTS      NUMBER              DEFAULT 0 NOT NULL,
      MAX_ATTEMPTS  NUMBER              DEFAULT 3 NOT NULL,
      ERROR_MSG     VARCHAR2(2000 CHAR),
      PROGRESS      NUMBER              DEFAULT 0,
      STAGE         VARCHAR2(30 CHAR),
      ENQUEUED_AT   TIMESTAMP           DEFAULT SYSTIMESTAMP NOT NULL,
      STARTED_AT    TIMESTAMP,
      FINISHED_AT   TIMESTAMP,
      CONSTRAINT PK_KB_JOBS PRIMARY KEY (JOB_ID),
      CONSTRAINT FK_KBJ_DOC FOREIGN KEY (DOC_ID)
        REFERENCES KB_DOCUMENTS(DOC_ID) ON DELETE CASCADE
    )
  `,
  `CREATE INDEX IDX_KBJ_PICK ON KB_INDEX_JOBS (STATUS, ENQUEUED_AT)`,
  `CREATE INDEX IDX_KBJ_DOC  ON KB_INDEX_JOBS (DOC_ID)`,
  `CREATE INDEX IDX_KBJ_TIME ON KB_INDEX_JOBS (ENQUEUED_AT DESC)`,

  // ── 4. URL 크롤링 후보 (Stage 2 준비, 스키마만 생성) ─────────────────────────
  `
    CREATE TABLE KB_CRAWL_CANDIDATES (
      CAND_ID     VARCHAR2(40 CHAR)    NOT NULL,
      JOB_ID      VARCHAR2(40 CHAR)    NOT NULL,
      PARENT_URL  VARCHAR2(2000 CHAR),
      TARGET_URL  VARCHAR2(2000 CHAR)  NOT NULL,
      TITLE       VARCHAR2(500 CHAR),
      MIME_HINT   VARCHAR2(50 CHAR),
      SIZE_HINT   NUMBER,
      SELECTED    NUMBER(1)            DEFAULT 0,
      CREATED_AT  TIMESTAMP            DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT PK_KB_CRAWL_C PRIMARY KEY (CAND_ID)
    )
  `,
  `CREATE INDEX IDX_CRAWL_JOB ON KB_CRAWL_CANDIDATES (JOB_ID)`,

  // ── 5. 검색 질의 로그 ────────────────────────────────────────────────────────
  `
    CREATE TABLE KB_SEARCH_QUERIES (
      QUERY_ID          VARCHAR2(40 CHAR)    NOT NULL,
      USER_ID           NUMBER,
      QUERY_TEXT        VARCHAR2(2000 CHAR),
      SEARCH_MODE       VARCHAR2(20 CHAR),
      LATENCY_MS        NUMBER,
      CHUNKS_RETRIEVED  NUMBER,
      CITATIONS_JSON    CLOB,
      CONVERSATION_ID   VARCHAR2(40 CHAR),
      CREATED_AT        TIMESTAMP  DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT PK_KB_QUERIES PRIMARY KEY (QUERY_ID)
    )
  `,
  `CREATE INDEX IDX_KBQ_USER ON KB_SEARCH_QUERIES (USER_ID, CREATED_AT)`,
];

export async function ensureKbChunkSchema(connection: any) {
  // ── 0. Oracle Text Preference (KOREAN_MORPH_LEXER) ────────────────────────
  try {
    await connection.execute(`
      BEGIN
        CTX_DDL.CREATE_PREFERENCE('KB_KOREAN_LEXER', 'KOREAN_MORPH_LEXER');
      END;
    `);
  } catch (err: any) {
    const isDup = err.message?.includes('DRG-10700') || err.message?.includes('DRG-10701');
    if (!isDup) console.warn('[schema] Oracle Text preference creation skipped/failed:', err.message);
  }

  for (const ddl of DDL) {
    try {
      await connection.execute(ddl);
    } catch (err: any) {
      if (!isAlreadyExists(err)) throw err;
    }
  }
}
