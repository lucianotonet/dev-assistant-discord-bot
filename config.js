
module.exports = {
  DEBUG: true,
  TOKEN_LIMIT: 8192,
  LLM_MODELS: ['mixtral-8x7b-32768', 'gemma2-9b-it', 'llama3-8b-8192', 'llama3-70b-8192', 'gemma-7b-it'],
  LLM_MODELS_TOOLS: ['llama3-8b-8192', 'llama3-70b-8192'],
  LLM_TEMPERATURE: 0.9,
  LLM_REASONING: 'CoT',
  RATE_LIMIT_RETRY_DELAY: 1000,
  MAX_RETRY_ATTEMPTS: 5,
};
