UPDATE KB_INDEX_JOBS
SET STATUS      = 'cancelled',
    FINISHED_AT = SYSTIMESTAMP,
    ERROR_MSG   = '사용자 취소'
WHERE JOB_ID = :jid
  AND STATUS IN ('queued', 'running')
