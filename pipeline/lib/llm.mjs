// lib/llm.mjs — provider-agnostic HTTP LLM client (OpenAI-compatible chat completions).
// Lets the WRITING stage also run inside GitHub Actions (no Termux/opencode needed):
//   author.yml -> author_stories.mjs -> writingPrompt(brief) -> this -> finalizeStory()
// Config (env; defaults = free tier, all overridable):
//   LLM_BASE_URL  default https://generativelanguage.googleapis.com/v1beta/openai
//   LLM_MODEL     default gemini-2.5-flash
//   LLM_API_KEY   REQUIRED (set as GH secret in author.yml) unless LLM_API_KEY_FILE
//                 points at a file containing it (prefer the file on local runs so the
//                 raw token never lands in shell history; .env-style export discouraged)
export const LLM_CFG = {
  baseUrl: (process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, ''),
  model: process.env.LLM_MODEL || 'gemini-2.5-flash',
  maxTokens: Number(process.env.LLM_MAX_TOKENS || 1800),
  temperature: Number(process.env.LLM_TEMPERATURE || 0.6),
  timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 120_000),
};

export async function llmApiKey() {
  if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;
  const f = process.env.LLM_API_KEY_FILE;
  if (f) {
    const { readFileSync } = await import('node:fs');
    return readFileSync(f, 'utf8').trim();
  }
  return null;
}

// Call the chat-completions endpoint. Returns the assistant text, or null on
// failure (caller decides: skip this brief, keep it queued for opencode).
export async function chatComplete(messages, { cfg = LLM_CFG, key } = {}) {
  const apiKey = key ?? llmApiKey();
  if (!apiKey) return null;
  const url = `${cfg.baseUrl}/chat/completions`;
  const body = {
    model: cfg.model,
    messages,
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'user-agent': 'newsdesk-bd-pipeline/1.0',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
  }
  const j = await res.json();
  return j?.choices?.[0]?.message?.content ?? null;
}
