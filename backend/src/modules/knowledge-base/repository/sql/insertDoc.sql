INSERT INTO KB_DOCUMENTS
  (DOC_ID, TITLE, CATEGORY_ID, DOC_TYPE, SERVICE_MASTER_ID, PRODUCT_ID, PRODUCT_NAME,
   VERSION_RANGE, OS_PLATFORM, VENDOR, AUTHOR, AUTHOR_USER_ID, SUMMARY, CONTENT,
   STATUS, CHUNKS, VECTORS, INDEX_STATUS, INDEX_PROGRESS, INDEX_STAGE,
   INDEX_MODEL, INDEX_MESSAGE, INDEX_UPDATED_AT, REVIEWED_AT,
   SOURCE_TYPE, SOURCE_URL, ENABLED, CREATED_AT, UPDATED_AT)
VALUES
  (:did, :title, :cat_id, :doc_type, :svc_id, :prod_id, :prod_name,
   :ver_range, :os_plat, :vendor, :author, :author_id, :summary, :content,
   :status, :chunks, 0, :idx_status, :idx_prog, :idx_stage,
   :idx_model, :idx_msg, :idx_upd, :reviewed,
   :src_type, :src_url, 1, SYSTIMESTAMP, SYSTIMESTAMP)
