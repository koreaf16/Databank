UPDATE AI_MODELS
SET
  NAME             = :name,
  VERSION          = :version,
  PROVIDER         = :provider,
  STATUS           = :status,
  ENDPOINT         = :endpoint,
  API_KEY          = :api_key,
  TOKEN_LIMIT      = :token_limit,
  COST_MONTH       = :cost_month,
  CONTEXT_LIMIT_KB = :ctx_limit_kb,
  IS_TRAINING      = :is_training,
  IS_DEFAULT       = :is_default,
  NOTES            = :notes,
  USE_CASES        = :use_cases,
  MODEL_TYPE       = :model_type,
  THINKING_MODE    = :thinking_mode,
  THINKING_FAMILY  = :thinking_family,
  UPDATED_AT       = SYSTIMESTAMP
WHERE MODEL_ID = :id
