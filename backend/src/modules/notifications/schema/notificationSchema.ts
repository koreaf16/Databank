// @ts-nocheck
/**
 * 파일: backend/src/modules/notifications/schema/notificationSchema.ts
 * 역할: 앱 내부 알림 테이블 DDL.
 */

import { isAlreadyExists } from '../../../infra/oracle/errorCodes.js';

const DDL = [
  `
    CREATE TABLE APP_NOTIFICATIONS (
      NOTIFICATION_ID VARCHAR2(40 CHAR) NOT NULL,
      USER_ID NUMBER NOT NULL,
      CATEGORY VARCHAR2(40 CHAR) NOT NULL,
      TITLE VARCHAR2(300 CHAR) NOT NULL,
      MESSAGE VARCHAR2(1000 CHAR),
      ENTITY_TYPE VARCHAR2(40 CHAR),
      ENTITY_ID VARCHAR2(120 CHAR),
      DEDUPE_KEY VARCHAR2(240 CHAR),
      READ_AT TIMESTAMP,
      ENABLED NUMBER(1) DEFAULT 1 NOT NULL,
      CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT PK_APP_NOTIFICATIONS PRIMARY KEY (NOTIFICATION_ID),
      CONSTRAINT FK_APP_NOTIFICATIONS_USER FOREIGN KEY (USER_ID) REFERENCES USERS(USER_ID),
      CONSTRAINT UK_APP_NOTIFICATIONS_DEDUPE UNIQUE (DEDUPE_KEY)
    )
  `,
  `CREATE INDEX IDX_APP_NOTIF_USER_CREATED ON APP_NOTIFICATIONS (USER_ID, CREATED_AT)`,
  `CREATE INDEX IDX_APP_NOTIF_USER_READ ON APP_NOTIFICATIONS (USER_ID, READ_AT)`,
];

export async function ensureNotificationSchema(connection: any): Promise<void> {
  for (const ddl of DDL) {
    try { await connection.execute(ddl); }
    catch (err: any) { if (!isAlreadyExists(err)) throw err; }
  }
}

