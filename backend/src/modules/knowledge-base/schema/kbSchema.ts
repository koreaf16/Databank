/**
 * 파일: backend/src/modules/knowledge-base/schema/kbSchema.js
 * 역할: 지식베이스 테이블 DDL.
 *       KB_CATEGORIES(자기참조), KB_DOCUMENTS, KB_DOCUMENT_TAGS, KB_DOCUMENT_VERSIONS.
 *       서버 기동 시 ensureKbSchema 호출 — CUSTOMERS·USERS FK 없으므로 의존성 제한적.
 *
 * 연관 파일:
 *   - modules/knowledge-base/repository/kbCategoryRepository.js
 *   - modules/knowledge-base/repository/kbDocumentRepository.js
 *   - backend/src/server.js : 스키마 초기화 순서
 */

import { isAlreadyExists } from '../../../infra/oracle/errorCodes.js';

const DDL = [
  `
    CREATE TABLE KB_CATEGORIES (
      CATEGORY_ID   VARCHAR2(40 CHAR)   NOT NULL,
      PARENT_ID     VARCHAR2(40 CHAR),
      NAME          VARCHAR2(200 CHAR)  NOT NULL,
      ICON          VARCHAR2(50 CHAR)   DEFAULT 'book',
      SORT_ORDER    NUMBER              DEFAULT 0 NOT NULL,
      ENABLED       NUMBER(1)           DEFAULT 1 NOT NULL,
      CREATED_AT    TIMESTAMP           DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT PK_KB_CATEGORIES  PRIMARY KEY (CATEGORY_ID),
      CONSTRAINT FK_KB_CAT_PARENT  FOREIGN KEY (PARENT_ID) REFERENCES KB_CATEGORIES(CATEGORY_ID)
    )
  `,
  `CREATE INDEX IDX_KB_CAT_PARENT ON KB_CATEGORIES (PARENT_ID, SORT_ORDER)`,
  `CREATE INDEX IDX_KB_CAT_LIST   ON KB_CATEGORIES (ENABLED, SORT_ORDER, NAME)`,
  `
    CREATE TABLE KB_DOCUMENTS (
      DOC_ID            VARCHAR2(40 CHAR)    NOT NULL,
      TITLE             VARCHAR2(500 CHAR)   NOT NULL,
      CATEGORY_ID       VARCHAR2(40 CHAR)    NOT NULL,
      DOC_TYPE          VARCHAR2(30 CHAR)    NOT NULL,
      SERVICE_MASTER_ID VARCHAR2(40 CHAR),
      PRODUCT_ID        VARCHAR2(40 CHAR),
      PRODUCT_NAME      VARCHAR2(200 CHAR),
      VERSION_RANGE     VARCHAR2(200 CHAR),
      VERSION_MIN_NUM   NUMBER,
      VERSION_MAX_NUM   NUMBER,
      OS_PLATFORM       VARCHAR2(100 CHAR),
      VENDOR            VARCHAR2(100 CHAR),
      AUTHOR            VARCHAR2(100 CHAR),
      SUMMARY           VARCHAR2(2000 CHAR),
      CONTENT           CLOB,
      STATUS            VARCHAR2(20 CHAR)    DEFAULT 'indexing' NOT NULL,
      CHUNKS            NUMBER               DEFAULT 0 NOT NULL,
      VECTORS           NUMBER               DEFAULT 0 NOT NULL,
      INDEX_STATUS      VARCHAR2(30 CHAR)    DEFAULT 'queued',
      INDEX_PROGRESS    NUMBER               DEFAULT 0,
      INDEX_STAGE       VARCHAR2(30 CHAR),
      INDEX_MODEL       VARCHAR2(100 CHAR)   DEFAULT 'text-embedding-3-large',
      INDEX_MESSAGE     VARCHAR2(500 CHAR),
      INDEX_UPDATED_AT  VARCHAR2(50 CHAR),
      REVIEWED_AT       VARCHAR2(50 CHAR)    DEFAULT '미검토',
      SOURCE_TYPE       VARCHAR2(20 CHAR)    DEFAULT 'text',
      SOURCE_URL        VARCHAR2(2000 CHAR),
      ENABLED           NUMBER(1)            DEFAULT 1 NOT NULL,
      AUTHOR_USER_ID    NUMBER,
      CREATED_AT        TIMESTAMP            DEFAULT SYSTIMESTAMP NOT NULL,
      UPDATED_AT        TIMESTAMP            DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT PK_KB_DOCUMENTS  PRIMARY KEY (DOC_ID),
      CONSTRAINT FK_KBD_CATEGORY  FOREIGN KEY (CATEGORY_ID) REFERENCES KB_CATEGORIES(CATEGORY_ID),
      CONSTRAINT FK_KBD_AUTHOR    FOREIGN KEY (AUTHOR_USER_ID) REFERENCES USERS(USER_ID),
      CONSTRAINT FK_KBD_SERVICE   FOREIGN KEY (SERVICE_MASTER_ID) REFERENCES SERVICE_MASTERS(MASTER_ID)
    )
  `,
  `CREATE INDEX IDX_KBD_CATEGORY ON KB_DOCUMENTS (CATEGORY_ID, ENABLED)`,
  `CREATE INDEX IDX_KBD_SERVICE  ON KB_DOCUMENTS (SERVICE_MASTER_ID, ENABLED)`,
  `CREATE INDEX IDX_KBD_PRODUCT  ON KB_DOCUMENTS (PRODUCT_ID, ENABLED)`,
  `CREATE INDEX IDX_KBD_AUTHOR   ON KB_DOCUMENTS (AUTHOR_USER_ID)`,
  `CREATE INDEX IDX_KBD_CREATED  ON KB_DOCUMENTS (CREATED_AT DESC)`,
  `CREATE INDEX IDX_KBD_IDXSTAT  ON KB_DOCUMENTS (INDEX_STATUS, CREATED_AT DESC)`,
  `CREATE INDEX IDX_KBD_TEXT     ON KB_DOCUMENTS (TITLE)
     INDEXTYPE IS CTXSYS.CONTEXT
     PARAMETERS ('DATASTORE KBD_DOC_DS LEXER KB_KOREAN_LEXER SYNC (ON COMMIT)')`,

  `
    CREATE TABLE KB_DOCUMENT_TAGS (
      DOC_ID  VARCHAR2(40 CHAR)   NOT NULL,
      TAG     VARCHAR2(100 CHAR)  NOT NULL,
      CONSTRAINT PK_KB_DOC_TAGS  PRIMARY KEY (DOC_ID, TAG),
      CONSTRAINT FK_KDT_DOC      FOREIGN KEY (DOC_ID) REFERENCES KB_DOCUMENTS(DOC_ID) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE KB_DOCUMENT_VERSIONS (
      DOC_ID   VARCHAR2(40 CHAR)  NOT NULL,
      VERSION  VARCHAR2(50 CHAR)  NOT NULL,
      CONSTRAINT PK_KB_DOC_VERSIONS PRIMARY KEY (DOC_ID, VERSION),
      CONSTRAINT FK_KDV_DOC         FOREIGN KEY (DOC_ID) REFERENCES KB_DOCUMENTS(DOC_ID) ON DELETE CASCADE
    )
  `,
];

// KB_DOCUMENTS에 RAG 관련 컬럼 추가 (ALTER — 이미 있으면 무시)
const ALTER_DDL = [
  `ALTER TABLE KB_DOCUMENTS ADD (EMBEDDING_MODEL_USED VARCHAR2(100 CHAR))`,
  `ALTER TABLE KB_DOCUMENTS ADD (CHUNKER_VERSION VARCHAR2(20 CHAR))`,
  `ALTER TABLE KB_DOCUMENTS ADD (RETRIEVAL_HINT VARCHAR2(500 CHAR))`,
  `ALTER TABLE KB_DOCUMENTS ADD (MIME_TYPE VARCHAR2(100 CHAR))`,
];

export async function ensureKbSchema(connection) {
  // ── 0. Oracle Text Preferences ──────────────────────────────────────────
  try {
    await connection.execute(`
      BEGIN
        CTX_DDL.CREATE_PREFERENCE('KB_KOREAN_LEXER', 'KOREAN_MORPH_LEXER');
      END;
    `);
  } catch (err: any) {
    if (!err.message?.includes('DRG-10700')) console.warn('[schema] KB_KOREAN_LEXER exists or failed');
  }

  try {
    await connection.execute(`
      BEGIN
        CTX_DDL.CREATE_PREFERENCE('KBD_DOC_DS', 'MULTI_COLUMN_DATASTORE');
        CTX_DDL.SET_ATTRIBUTE('KBD_DOC_DS', 'COLUMNS', 'TITLE, SUMMARY');
      END;
    `);
  } catch (err: any) {
    if (!err.message?.includes('DRG-10700')) console.warn('[schema] KBD_DOC_DS exists or failed');
  }

  for (const ddl of DDL) {
    try { await connection.execute(ddl); }
    catch (err) { if (!isAlreadyExists(err)) throw err; }
  }
  for (const ddl of ALTER_DDL) {
    try { await connection.execute(ddl); }
    catch (err: any) {
      // ORA-01430: 컬럼 이미 존재
      if (err.errorNum !== 1430 && !isAlreadyExists(err)) throw err;
    }
  }
}
