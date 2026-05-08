SELECT l.LOG_ID      AS "id",
       l.ACTION      AS "action",
       l.ENTITY_TYPE AS "entityType",
       l.ENTITY_ID   AS "entityId",
       l.USER_ID     AS "userId",
       u.DISPLAY_NAME AS "userName",
       l.SUMMARY     AS "summary",
       l.DETAIL      AS "detail",
       l.IP_ADDR     AS "ipAddr",
       TO_CHAR(l.CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') AS "createdAt"
FROM AUDIT_LOGS l
LEFT JOIN USERS u ON u.USER_ID = l.USER_ID
