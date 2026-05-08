SELECT NOTIFICATION_ID AS "id", USER_ID AS "userId", CATEGORY AS "category",
       TITLE AS "title", MESSAGE AS "message", ENTITY_TYPE AS "entityType",
       ENTITY_ID AS "entityId", DEDUPE_KEY AS "dedupeKey",
       TO_CHAR(READ_AT, 'YYYY-MM-DD"T"HH24:MI') AS "readAt",
       TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI') AS "createdAt"
FROM APP_NOTIFICATIONS
