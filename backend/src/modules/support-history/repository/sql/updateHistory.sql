UPDATE SUPPORT_HISTORIES
SET
  CUSTOMER_ID  = :cust_id,
  SERVICE_NAME = :svc,
  HISTORY_TYPE = :htype,
  SUPPORT_MODE = :smode,
  STATUS       = :status,
  PRIORITY     = :priority,
  DOCUMENT_KIND= :document_kind,
  AI_CONFIDENCE= :ai_confidence,
  SUMMARY      = :summary,
  WORK_DETAIL  = :work_detail,
  FINDING      = :finding,
  ACTION_RESULT= :action_result,
  PARSED_JSON  = :parsed_json,
  DEPARTURE_AT      = :dep_at,
  SUPPORT_STARTED_AT= :start_at,
  SUPPORT_ENDED_AT  = :end_at,
  RETURN_AT         = :ret_at,
  WORKSPACE_ID = :workspace_id,
  UPDATED_AT   = SYSTIMESTAMP
WHERE HISTORY_ID = :hid
