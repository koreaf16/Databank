/**
 * 파일: backend/src/modules/settings/report-templates/schema/reportTemplateSchema.js
 * 역할: 보고서 마스터 템플릿(REPORT_MASTER_TEMPLATES) DDL.
 *       HTML/CSS/LLM 프롬프트를 CLOB으로 저장. CUSTOMERS와 FK.
 *       서버 기동 시 initSchema.js에서 호출 → 멱등(ORA-00955 무시).
 *
 * 연관 파일:
 *   - modules/customers/schema/customerSchema.js : CUSTOMERS 테이블이 먼저 생성돼야 함
 *   - backend/src/scripts/initSchema.js
 */

import { isAlreadyExists } from '../../../../infra/oracle/errorCodes.js';

const DDL = [
  `
    CREATE TABLE REPORT_MASTER_TEMPLATES (
      TEMPLATE_ID VARCHAR2(100 CHAR) NOT NULL,
      CUSTOMER_ID NUMBER NULL,
      TEMPLATE_NAME VARCHAR2(200 CHAR) NOT NULL,
      TEMPLATE_VERSION VARCHAR2(50 CHAR) NOT NULL,
      HTML_CONTENT CLOB,
      CSS_CONTENT CLOB,
      LLM_PROMPT CLOB,
      ENABLED NUMBER(1) DEFAULT 1 NOT NULL,
      CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT PK_REPORT_TEMPLATES PRIMARY KEY (TEMPLATE_ID),
      CONSTRAINT FK_RPTPL_CUSTOMER FOREIGN KEY (CUSTOMER_ID) REFERENCES CUSTOMERS(CUSTOMER_ID)
    )
  `,
  `CREATE INDEX IDX_RPTPL_CUSTOMER ON REPORT_MASTER_TEMPLATES (CUSTOMER_ID)`,
  `CREATE INDEX IDX_RPTPL_ENABLED ON REPORT_MASTER_TEMPLATES (ENABLED)`,
];

export async function ensureReportTemplateSchema(connection) {
  for (const ddl of DDL) {
    try { await connection.execute(ddl); }
    catch (error) { if (!isAlreadyExists(error)) throw error; }
  }
}
