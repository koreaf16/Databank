SELECT
  c.CHANNEL_ID   AS "id",
  c.KIND         AS "kind",
  c.NAME         AS "name",
  c.TOPIC        AS "topic",
  c.CUSTOMER_ID  AS "customerId",
  cu.CUSTOMER_MAIN AS "customerName",
  c.DEPT_ID      AS "deptId",
  d.DEPT_NAME    AS "deptName",
  c.SEVERITY     AS "severity",
  c.STATUS       AS "status",
  c.IS_PINNED    AS "isPinned",
  c.IS_READ_ONLY AS "isReadOnly",
  c.ICON         AS "icon",
  c.COLOR        AS "color",
  c.CREATED_BY   AS "createdBy",
  c.CREATED_AT   AS "createdAt",
  c.UPDATED_AT   AS "updatedAt"
FROM CHANNELS c
LEFT JOIN CUSTOMERS   cu ON cu.CUSTOMER_ID = c.CUSTOMER_ID
LEFT JOIN DEPARTMENTS d  ON d.DEPT_ID      = c.DEPT_ID
