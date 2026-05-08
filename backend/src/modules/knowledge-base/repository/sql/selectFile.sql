SELECT FILE_ID AS "id", DOC_ID AS "docId", FILE_NAME AS "fileName",
       MIME_TYPE AS "mimeType", SIZE_BYTES AS "sizeBytes", SHA256 AS "sha256",
       PAGE_COUNT AS "pageCount", EXTRACTED_AT AS "extractedAt",
       PARSER_NAME AS "parserName", PREVIEW_TEXT AS "previewText",
       CREATED_AT AS "createdAt"
FROM KB_DOCUMENT_FILES
