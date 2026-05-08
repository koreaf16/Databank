UPDATE EVENTS
SET TITLE=:title, EVENT_TYPE=:event_type,
    CUSTOMER_ID=:customer_id, SERVICE_NAME=:service_name,
    START_AT=TO_TIMESTAMP(:start_at, 'YYYY-MM-DD"T"HH24:MI'),
    END_AT=TO_TIMESTAMP(:end_at,     'YYYY-MM-DD"T"HH24:MI'),
    METHOD=:method, MEMO=:memo, UPDATED_AT=SYSTIMESTAMP,
    ALL_DAY=:all_day, COLOR=:color, LOCATION=:location, REMINDER_MINUTES=:reminder_minutes,
    RECURRENCE_RULE=:recurrence_rule, RECURRENCE_EXDATES=:recurrence_exdates,
    RECURRENCE_MASTER_ID=:recurrence_master_id,
    RECURRENCE_ORIGINAL_START=TO_TIMESTAMP(:recurrence_original_start, 'YYYY-MM-DD"T"HH24:MI')
WHERE EVENT_ID=:id
