SELECT u.USER_ID AS "id", u.USERNAME AS "username", u.DISPLAY_NAME AS "name",
       u.EMAIL AS "email", u.POSITION_NAME AS "position",
       u.POSITION_ID AS "positionId", p.POSITION_NAME AS "positionLabel",
       u.ADMIN_TYPE AS "adminType", u.USE_TYPE AS "useType",
       u.TELEGRAM_ID AS "telegramId", u.CHECK_NOTICE AS "checkNotice",
       u.CHECK_UPDATE AS "checkUpdate", u.ENABLED AS "enabled",
       d.DEPT_ID AS "deptId", d.DEPT_NAME AS "department",
       u.RBAC_ROLE_ID AS "rbacRoleId",
       rr.LABEL AS "rbacRoleLabel",
       rr.COLOR AS "rbacRoleColor"
FROM USERS u JOIN DEPARTMENTS d ON d.DEPT_ID = u.DEPT_ID
LEFT JOIN POSITIONS p ON p.POSITION_ID = u.POSITION_ID
LEFT JOIN RBAC_ROLES rr ON rr.ROLE_ID = u.RBAC_ROLE_ID
WHERE u.USER_ID = :id
