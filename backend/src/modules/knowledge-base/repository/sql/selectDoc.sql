SELECT d.DOC_ID AS "id", d.TITLE AS "title",
       d.CATEGORY_ID AS "categoryId", d.DOC_TYPE AS "docType",
       d.SERVICE_MASTER_ID AS "serviceMasterId", d.PRODUCT_ID AS "productId", d.PRODUCT_NAME AS "productName",
       d.VERSION_RANGE AS "versionRange", d.OS_PLATFORM AS "osPlatform",
       d.VENDOR AS "vendor", d.AUTHOR AS "author", d.AUTHOR_USER_ID AS "authorUserId",
       u.DISPLAY_NAME AS "authorName",
       d.SUMMARY AS "summary", d.CONTENT AS "content",
       d.STATUS AS "status", d.CHUNKS AS "chunks", d.VECTORS AS "vectors",
       d.INDEX_STATUS AS "indexStatus", d.INDEX_PROGRESS AS "indexProgress",
       d.INDEX_STAGE AS "indexStage", d.INDEX_MODEL AS "indexModel",
       d.INDEX_MESSAGE AS "indexMessage", d.INDEX_UPDATED_AT AS "indexUpdatedAt",
       d.REVIEWED_AT AS "reviewedAt",
       (SELECT LISTAGG(TAG, ',') WITHIN GROUP (ORDER BY TAG) FROM KB_DOCUMENT_TAGS WHERE DOC_ID = d.DOC_ID) AS "tagsRaw",
       (SELECT LISTAGG(VERSION, ',') WITHIN GROUP (ORDER BY VERSION) FROM KB_DOCUMENT_VERSIONS WHERE DOC_ID = d.DOC_ID) AS "versionsRaw"
FROM KB_DOCUMENTS d
LEFT JOIN USERS u ON u.USER_ID = d.AUTHOR_USER_ID
