INSERT INTO CHANNEL_MESSAGES (
  CHANNEL_ID, WORKSPACE_ID, AUTHOR_USER_ID, IS_BOT, BOT_NAME, MSG_TYPE,
  CONTENT, ATTACHMENT_JSON, PARENT_ID,
  SENT_AT, UPDATED_AT
) VALUES (
  :cid, :workspace_id, :author_id, :is_bot, :bot_name, :msg_type,
  :content, :attach_json, :parent_id,
  SYSTIMESTAMP, SYSTIMESTAMP
)
RETURNING MESSAGE_ID INTO :out_id
