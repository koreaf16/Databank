INSERT INTO USERS (
  USER_ID, USERNAME, DISPLAY_NAME, PASSWORD_HASH, ENABLED, DEPT_ID,
  EMAIL, POSITION_NAME, POSITION_ID, ADMIN_TYPE, USE_TYPE, RBAC_ROLE_ID, TELEGRAM_ID,
  CHECK_NOTICE, CHECK_UPDATE, SOURCE_CREATED_AT, SOURCE_UPDATED_AT, CREATED_AT, UPDATED_AT
) VALUES (
  :id, :username, :name, :password_hash, :enabled, :dept_id,
  :email, :position_name, :position_id, :admin_type, :use_type, :rbac_role_id, :telegram_id,
  :check_notice, :check_update, NULL, NULL, SYSTIMESTAMP, SYSTIMESTAMP
)
