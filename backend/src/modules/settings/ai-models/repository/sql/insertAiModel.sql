INSERT INTO AI_MODELS (
  NAME, VERSION, PROVIDER, STATUS, ENDPOINT, API_KEY,
  TOKENS_USED, TOKEN_LIMIT, COST_MONTH, CONTEXT_LIMIT_KB, IS_TRAINING, IS_DEFAULT,
  NOTES, USE_CASES, MODEL_TYPE,
  THINKING_MODE, THINKING_FAMILY,
  CREATED_AT, UPDATED_AT
) VALUES (
  :name, :version, :provider, :status, :endpoint, :api_key,
  :tokens_used, :token_limit, :cost_month, :ctx_limit_kb, :is_training, :is_default,
  :notes, :use_cases, :model_type,
  :thinking_mode, :thinking_family,
  SYSTIMESTAMP, SYSTIMESTAMP
)
RETURNING MODEL_ID INTO :out_id
