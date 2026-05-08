UPDATE CHECKLIST_TEMPLATES
SET
  NAME              = :name,
  KIND              = :kind,
  SCOPE             = :scope,
  STATUS            = :status,
  CUSTOMER_ID       = :customer_id,
  SERVICE_MASTER_ID = :svc_master_id,
  VERSION           = :version,
  OWNER_ID          = :owner_id,
  SECTIONS_JSON     = :sections_json,
  ENABLED           = :enabled,
  UPDATED_AT        = SYSTIMESTAMP
WHERE TEMPLATE_ID = :id
