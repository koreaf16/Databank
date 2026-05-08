SELECT
  m.MESSAGE_ID      AS "id",
  m.CHANNEL_ID      AS "channelId",
  m.WORKSPACE_ID    AS "workspaceId",
  m.AUTHOR_USER_ID  AS "authorUserId",
  u.DISPLAY_NAME    AS "authorName",
  u.POSITION_NAME   AS "authorPosition",
  m.IS_BOT          AS "isBot",
  m.BOT_NAME        AS "botName",
  m.MSG_TYPE        AS "msgType",
  m.CONTENT         AS "content",
  m.ATTACHMENT_JSON AS "attachmentJson",
  m.PARENT_ID       AS "parentId",
  m.THREAD_COUNT    AS "threadCount",
  m.SENT_AT         AS "sentAt",
  m.UPDATED_AT      AS "updatedAt"
FROM CHANNEL_MESSAGES m
LEFT JOIN USERS u ON u.USER_ID = m.AUTHOR_USER_ID
