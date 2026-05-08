UPDATE KB_DOCUMENTS
SET TITLE=:title, CATEGORY_ID=:cat_id, DOC_TYPE=:doc_type,
    SERVICE_MASTER_ID=:svc_id, PRODUCT_ID=:prod_id, PRODUCT_NAME=:prod_name,
    VERSION_RANGE=:ver_range, OS_PLATFORM=:os_plat,
    VENDOR=:vendor, AUTHOR=:author, AUTHOR_USER_ID=:author_id, SUMMARY=:summary,
    STATUS=:status, CHUNKS=:chunks, VECTORS=:vectors,
    INDEX_STATUS=:idx_status, INDEX_PROGRESS=:idx_prog,
    INDEX_STAGE=:idx_stage, INDEX_MODEL=:idx_model,
    INDEX_MESSAGE=:idx_msg, INDEX_UPDATED_AT=:idx_upd,
    UPDATED_AT=SYSTIMESTAMP
WHERE DOC_ID=:did
