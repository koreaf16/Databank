SELECT
  u.USER_ID       AS "id",
  u.USERNAME      AS "username",
  u.DISPLAY_NAME  AS "name",
  u.EMAIL         AS "email",
  u.POSITION_NAME AS "position",
  u.PASSWORD_HASH AS "passwordHash",
  u.ENABLED       AS "enabled",
  d.DEPT_ID       AS "deptId",
  d.DEPT_NAME     AS "department",
  u.RBAC_ROLE_ID  AS "rbacRoleId",
  rr.LABEL        AS "rbacRoleLabel",
  rr.COLOR        AS "rbacRoleColor"
FROM USERS u
JOIN DEPARTMENTS d ON d.DEPT_ID = u.DEPT_ID
LEFT JOIN RBAC_ROLES rr ON rr.ROLE_ID = u.RBAC_ROLE_ID
WHERE LOWER(u.USERNAME) = LOWER(:username)
  AND u.ENABLED = 1
