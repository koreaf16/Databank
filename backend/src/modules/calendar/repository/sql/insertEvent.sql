INSERT INTO EVENTS
  (TITLE, EVENT_TYPE, CUSTOMER_ID, SERVICE_NAME, START_AT, END_AT, METHOD, MEMO,
   CREATED_BY, ENABLED, CREATED_AT, UPDATED_AT, ALL_DAY, COLOR, LOCATION, REMINDER_MINUTES,
   RECURRENCE_RULE, RECURRENCE_EXDATES, RECURRENCE_MASTER_ID, RECURRENCE_ORIGINAL_START)
VALUES
  (:title, :event_type, :customer_id, :service_name,
   TO_TIMESTAMP(:start_at, 'YYYY-MM-DD"T"HH24:MI'),
   TO_TIMESTAMP(:end_at,   'YYYY-MM-DD"T"HH24:MI'),
   :method, :memo, :created_by, 1, SYSTIMESTAMP, SYSTIMESTAMP,
   :all_day, :color, :location, :reminder_minutes,
   :recurrence_rule, :recurrence_exdates, :recurrence_master_id,
   TO_TIMESTAMP(:recurrence_original_start, 'YYYY-MM-DD"T"HH24:MI'))
RETURNING EVENT_ID INTO :out_id
