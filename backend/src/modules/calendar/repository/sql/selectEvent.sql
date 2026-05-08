SELECT e.EVENT_ID AS "id", e.TITLE AS "title", e.EVENT_TYPE AS "eventType",
       e.CUSTOMER_ID AS "customerId", c.CUSTOMER_MAIN AS "customerName",
       e.SERVICE_NAME AS "serviceName",
       TO_CHAR(e.START_AT, 'YYYY-MM-DD"T"HH24:MI') AS "startAt",
       TO_CHAR(e.END_AT,   'YYYY-MM-DD"T"HH24:MI') AS "endAt",
       e.METHOD AS "method", e.MEMO AS "memo", e.CREATED_BY AS "createdBy",
       e.ALL_DAY AS "allDay", e.COLOR AS "color", e.LOCATION AS "location",
       e.REMINDER_MINUTES AS "reminderMinutes",
       e.RECURRENCE_RULE AS "recurrenceRule",
       e.RECURRENCE_EXDATES AS "recurrenceExdates",
       e.RECURRENCE_MASTER_ID AS "recurrenceMasterId",
       TO_CHAR(e.RECURRENCE_ORIGINAL_START, 'YYYY-MM-DD"T"HH24:MI') AS "recurrenceOriginalStart"
FROM EVENTS e
LEFT JOIN CUSTOMERS c ON c.CUSTOMER_ID = e.CUSTOMER_ID
