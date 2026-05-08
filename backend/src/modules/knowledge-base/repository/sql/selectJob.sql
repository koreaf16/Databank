SELECT JOB_ID AS "id", DOC_ID AS "docId", KIND AS "kind",
       PAYLOAD_JSON AS "payloadJson", STATUS AS "status",
       ATTEMPTS AS "attempts", MAX_ATTEMPTS AS "maxAttempts",
       ERROR_MSG AS "errorMsg", PROGRESS AS "progress", STAGE AS "stage",
       TO_CHAR(ENQUEUED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') AS "enqueuedAt",
       TO_CHAR(STARTED_AT,  'YYYY-MM-DD"T"HH24:MI:SS') AS "startedAt",
       TO_CHAR(FINISHED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') AS "finishedAt"
FROM KB_INDEX_JOBS
