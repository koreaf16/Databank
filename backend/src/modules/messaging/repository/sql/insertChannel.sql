INSERT INTO CHANNELS (
  KIND, NAME, TOPIC, CUSTOMER_ID, DEPT_ID,
  SEVERITY, STATUS, IS_PINNED, IS_READ_ONLY, ICON, COLOR, CREATED_BY,
  CREATED_AT, UPDATED_AT
) VALUES (
  :kind, :name, :topic, :customer_id, :dept_id,
  :severity, :status, :is_pinned, :is_read_only, :icon, :color, :created_by,
  SYSTIMESTAMP, SYSTIMESTAMP
)
RETURNING CHANNEL_ID INTO :out_id
