UPDATE USERS
SET USERNAME=:username, DISPLAY_NAME=:name, DEPT_ID=:dept_id, ENABLED=:enabled,
    EMAIL=:email, POSITION_NAME=:position_name, POSITION_ID=:position_id,
    ADMIN_TYPE=:admin_type, USE_TYPE=:use_type, RBAC_ROLE_ID=:rbac_role_id,
    TELEGRAM_ID=:telegram_id, CHECK_NOTICE=:check_notice, CHECK_UPDATE=:check_update,
    UPDATED_AT=SYSTIMESTAMP
WHERE USER_ID = :id
