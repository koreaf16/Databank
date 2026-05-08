INSERT INTO ATTENDANCE_NOTICES (
  NOTICE_ID, STAFF_USER_ID, KIND,
  ATTEND_DATE, EFFECTIVE_TIME,
  CUSTOMER_ID, SITE_NAME, WORK_TITLE,
  MEMO, MANUAL_LOCATION_TEXT,
  GPS_LAT, GPS_LNG, GPS_ACCURACY, GPS_CAPTURED_AT, GPS_CONSENT,
  STATUS, CREATED_AT, UPDATED_AT
) VALUES (
  :notice_id, :staff_id, :kind,
  TO_DATE(:attend_date, 'YYYY-MM-DD'), :effective_time,
  :customer_id, :site_name, :work_title,
  :memo, :manual_text,
  :lat, :lng, :accuracy, :captured_at, :consent,
  'notified', SYSTIMESTAMP, SYSTIMESTAMP
)
