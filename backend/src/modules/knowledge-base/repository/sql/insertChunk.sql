INSERT INTO KB_DOCUMENT_CHUNKS
  (CHUNK_ID, DOC_ID, FILE_ID, ORDINAL, HEADING_PATH,
   PAGE_FROM, PAGE_TO, TOKEN_COUNT, CONTENT_TEXT,
   EMBEDDING, EMBEDDING_MODEL, LANG)
VALUES (:cid, :did, :fid, :ord, :hp,
        :pf, :pt, :tc, :ct,
        TO_VECTOR(:emb), :emodel, :lang)
