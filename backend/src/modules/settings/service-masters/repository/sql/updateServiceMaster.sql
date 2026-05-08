UPDATE SERVICE_MASTERS
SET
  NAME          = :name,
  CATEGORY      = :category,
  DEFAULT_FREQ  = :default_freq,
  VERSIONS_JSON = :versions_json,
  ITEMS_JSON    = :items_json,
  ENABLED       = :enabled,
  UPDATED_AT    = SYSTIMESTAMP
WHERE MASTER_ID = :id
