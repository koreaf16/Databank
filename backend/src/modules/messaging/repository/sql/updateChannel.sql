UPDATE CHANNELS
SET
  NAME        = :name,
  TOPIC       = :topic,
  SEVERITY    = :severity,
  STATUS      = :status,
  IS_PINNED   = :is_pinned,
  IS_READ_ONLY = :is_read_only,
  UPDATED_AT  = SYSTIMESTAMP
WHERE CHANNEL_ID = :id
