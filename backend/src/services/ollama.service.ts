/**
 * ============================================================================
 * OLLAMA CLIENT — KSRCE AI Assistant gateway
 * ============================================================================
 *
 * The browser NEVER talks to the Ollama server. This service is the ONLY
 * process that speaks to Ollama, and it is only reachable through the
 * authenticated `/api/ai/*` routes on this backend. The Ollama server runs on a
 * separate local/college host and is configured entirely through environment
 * variables (`OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS`). It is
 * never hardcoded in frontend code.
 *
 * Configuration is read on EVERY call (never cached), so a deployment can flip
 * the endpoint or model without rebuilding.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen3:8b';
const DEFAULT_TIMEOUT_MS = 60_000;
/** Hard cap on a single assistant reply, applied before it is persisted. */
export const OLLAMA_MAX_RESPONSE_CHARS = 8000;

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatResult {
  content: string;
  model: string;
}

export type OllamaErrorKind = 'UNAVAILABLE' | 'TIMEOUT' | 'HTTP' | 'MALFORMED';

export class OllamaServiceError extends Error {
  readonly kind: OllamaErrorKind;
  constructor(kind: OllamaErrorKind, message: string) {
    super(message);
    this.name = 'OllamaServiceError';
    this.kind = kind;
  }
}

function ollamaConfig() {
  return {
    baseUrl: (process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, ''),
    model: (process.env.OLLAMA_MODEL || DEFAULT_MODEL).trim(),
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
}

/**
 * POST /api/chat  (non-streaming).
 * Returns the assistant's `message.content`.
 */
export async function chatWithOllama(
  messages: OllamaChatMessage[]
): Promise<OllamaChatResult> {
  const { baseUrl, model, timeoutMs } = ollamaConfig();
  if (!baseUrl || !model) {
    throw new OllamaServiceError('MALFORMED', 'Ollama is not configured (OLLAMA_BASE_URL / OLLAMA_MODEL).');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new OllamaServiceError('HTTP', `Ollama responded with HTTP ${res.status}.`);
    }

    const raw = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new OllamaServiceError('MALFORMED', 'Ollama returned a malformed response.');
    }

    const content = data?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new OllamaServiceError('MALFORMED', 'Ollama returned an empty response.');
    }

    return {
      content: content.trim().slice(0, OLLAMA_MAX_RESPONSE_CHARS),
      model: data?.model || model,
    };
  } catch (err: any) {
    if (err instanceof OllamaServiceError) throw err;
    if (err?.name === 'AbortError') {
      throw new OllamaServiceError('TIMEOUT', `Ollama did not respond within ${timeoutMs}ms.`);
    }
    throw new OllamaServiceError('UNAVAILABLE', 'Ollama server is unreachable.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/tags — lightweight reachability + model availability probe.
 * Never throws: the endpoint answers `{ available }`.
 */
export async function checkOllamaAvailability(): Promise<{
  available: boolean;
  model: string;
  models: string[];
}> {
  const { baseUrl, model, timeoutMs } = ollamaConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    if (!res.ok) return { available: false, model, models: [] };
    const raw = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      return { available: false, model, models: [] };
    }
    const models: string[] = Array.isArray(data?.models)
      ? data.models.map((m: any) => m?.name).filter(Boolean)
      : [];
    return { available: true, model, models };
  } catch {
    return { available: false, model, models: [] };
  } finally {
    clearTimeout(timer);
  }
}