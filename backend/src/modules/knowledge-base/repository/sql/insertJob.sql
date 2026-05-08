INSERT INTO KB_INDEX_JOBS
  (JOB_ID, DOC_ID, KIND, PAYLOAD_JSON, STATUS)
VALUES (:jid, :did, :kind, :payload, 'queued')
