DELETE FROM KB_INDEX_JOBS
WHERE STATUS IN ('done', 'failed', 'cancelled')
