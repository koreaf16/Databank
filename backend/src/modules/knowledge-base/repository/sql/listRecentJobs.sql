SELECT j.JOB_ID      AS "id",
       j.DOC_ID      AS "docId",
       j.KIND        AS "kind",
       j.STATUS      AS "status",
       j.ATTEMPTS    AS "attempts",
       j.MAX_ATTEMPTS AS "maxAttempts",
       j.ERROR_MSG   AS "errorMsg",
       j.PROGRESS    AS "progress",
       j.STAGE       AS "stage",
       TO_CHAR(j.ENQUEUED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') AS "enqueuedAt",
       TO_CHAR(j.STARTED_AT,  'YYYY-MM-DD"T"HH24:MI:SS') AS "startedAt",
       TO_CHAR(j.FINISHED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') AS "finishedAt",
       d.TITLE       AS "docTitle"
FROM KB_INDEX_JOBS j
LEFT JOIN KB_DOCUMENTS d ON d.DOC_ID = j.DOC_ID
ORDER BY j.ENQUEUED_AT DESC
FETCH FIRST :lim ROWS ONLY
