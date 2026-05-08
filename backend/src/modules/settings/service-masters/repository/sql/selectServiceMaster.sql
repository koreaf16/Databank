SELECT
  MASTER_ID     AS "id",
  NAME          AS "name",
  CATEGORY      AS "category",
  DEFAULT_FREQ  AS "defaultFreq",
  VERSIONS_JSON AS "versionsJson",
  ITEMS_JSON    AS "itemsJson",
  ENABLED       AS "enabled",
  UPDATED_AT    AS "updatedAt"
FROM SERVICE_MASTERS
