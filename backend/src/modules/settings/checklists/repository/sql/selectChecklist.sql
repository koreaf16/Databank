SELECT
  TEMPLATE_ID       AS "id",
  NAME              AS "name",
  KIND              AS "kind",
  SCOPE             AS "scope",
  STATUS            AS "status",
  CUSTOMER_ID       AS "customerId",
  SERVICE_MASTER_ID AS "serviceMasterId",
  VERSION           AS "version",
  OWNER_ID          AS "ownerId",
  SECTIONS_JSON     AS "sectionsJson",
  ENABLED           AS "enabled",
  USED_BY           AS "usedBy",
  CREATED_AT        AS "createdAt",
  UPDATED_AT        AS "updatedAt"
FROM CHECKLIST_TEMPLATES
