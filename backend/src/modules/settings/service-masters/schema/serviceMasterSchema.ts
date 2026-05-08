/**
 * 파일: backend/src/modules/settings/service-masters/schema/serviceMasterSchema.js
 * 역할: SERVICE_MASTERS 테이블 DDL. 업무(서비스) 카테고리별 표준 점검 항목 마스터.
 *       MASTER_ID는 'oracle19c' 형태의 문자열 PK — KB/체크리스트 FK와 호환.
 *
 * 연관 파일:
 *   - repository/serviceMasterRepository.js
 *   - backend/src/server.js : 스키마 초기화
 */

import { isAlreadyExists } from '../../../../infra/oracle/errorCodes.js';

const DDL = [
  `
    CREATE TABLE SERVICE_MASTERS (
      MASTER_ID     VARCHAR2(100 CHAR),
      NAME          VARCHAR2(200 CHAR)  NOT NULL,
      CATEGORY      VARCHAR2(100 CHAR),
      DEFAULT_FREQ  VARCHAR2(40 CHAR),
      VERSIONS_JSON VARCHAR2(1000 CHAR),
      ITEMS_JSON    CLOB,
      ENABLED       NUMBER(1)          DEFAULT 1 NOT NULL,
      CREATED_AT    TIMESTAMP          DEFAULT SYSTIMESTAMP NOT NULL,
      UPDATED_AT    TIMESTAMP          DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT PK_SERVICE_MASTERS PRIMARY KEY (MASTER_ID)
    )
  `,
];

export async function ensureServiceMasterSchema(connection) {
  for (const ddl of DDL) {
    try { await connection.execute(ddl); }
    catch (err) { if (!isAlreadyExists(err)) throw err; }
  }
}
