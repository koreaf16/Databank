SELECT
  sh.HISTORY_ID AS "id",
  sh.CUSTOMER_ID AS "customerId",
  c.CUSTOMER_MAIN AS "customer",
  sh.WORKSPACE_ID AS "workspaceId",
  sh.SERVICE_NAME AS "service",
  sh.HISTORY_TYPE AS "type",
  sh.SUPPORT_MODE AS "supportMode",
  sh.STATUS AS "status",
  sh.PRIORITY AS "priority",
  sh.DOCUMENT_KIND AS "documentKind",
  sh.AI_CONFIDENCE AS "aiConfidence",
  sh.SUMMARY AS "summary",
  sh.WORK_DETAIL AS "workDetail",
  sh.FINDING AS "finding",
  sh.ACTION_RESULT AS "action",
  sh.PARSED_JSON AS "parsedJson",
  sh.CREATED_BY AS "createdBy",
  TO_CHAR(sh.DEPARTURE_AT,       'YYYY-MM-DD"T"HH24:MI') AS "departureAt",
  TO_CHAR(sh.SUPPORT_STARTED_AT, 'YYYY-MM-DD"T"HH24:MI') AS "supportStartedAt",
  TO_CHAR(sh.SUPPORT_ENDED_AT,   'YYYY-MM-DD"T"HH24:MI') AS "supportEndedAt",
  TO_CHAR(sh.RETURN_AT,          'YYYY-MM-DD"T"HH24:MI') AS "returnAt"
FROM SUPPORT_HISTORIES sh
JOIN CUSTOMERS c ON c.CUSTOMER_ID = sh.CUSTOMER_ID
