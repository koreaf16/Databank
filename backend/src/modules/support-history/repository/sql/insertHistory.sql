INSERT INTO SUPPORT_HISTORIES
  (HISTORY_ID, CUSTOMER_ID, SERVICE_NAME, HISTORY_TYPE, SUPPORT_MODE,
   STATUS, PRIORITY, DOCUMENT_KIND, AI_CONFIDENCE,
   SUMMARY, WORK_DETAIL, FINDING, ACTION_RESULT, PARSED_JSON,
   DEPARTURE_AT, SUPPORT_STARTED_AT, SUPPORT_ENDED_AT, RETURN_AT,
   WORKSPACE_ID,
   ENABLED, CREATED_BY, CREATED_AT, UPDATED_AT)
VALUES
  (:hid, :cust_id, :svc, :htype, :smode,
   :status, :priority, :document_kind, :ai_confidence,
   :summary, :work_detail, :finding, :action_result, :parsed_json,
   :dep_at, :start_at, :end_at, :ret_at,
   :workspace_id,
   1, :created_by, SYSTIMESTAMP, SYSTIMESTAMP)
