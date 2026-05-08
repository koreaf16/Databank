DELETE FROM KB_INDEX_JOBS
WHERE JOB_ID = :jid
  AND STATUS IN ('done', 'failed', 'cancelled')
