/**
 * ============================================================================
 * GEMINI CLIENT — KSRCE AI Assistant provider (official Google Gen AI SDK)
 * ============================================================================
 *
 * The browser NEVER talks to Google. This service is the ONLY process that
 * holds `GEMINI_API_KEY`, and it is reachable only through the authenticated
 * `/api/ai/*` routes on this backend. The key is therefore never exposed to
 * React, browser JavaScript, frontend env vars, API responses or source control.
 *
 * Configuration is read on EVERY call (never baked in), so a deployment can
 * rotate the key or switch model without rebuilding:
 *
 *   GEMINI_API_KEY     the API key (backend-only; required to enable Gemini)
 *   GEMINI_MODEL       model id; defaults to a currently supported Gemini model
 *   GEMINI_TIMEOUT_MS  per-request timeout in milliseconds
 *   GEMINI_BASE_URL    optional base-URL override (used by the offline test mock)
 *
 * This module deliberately never `console.log`s the key or the prompt, and no
 * thrown error carries the key. `chatWithGemini` retries nothing, so a single
 * user message maps to at most one billable request.
 */

import { GoogleGenAI, type Content } from '@google/genai';

/** A currently supported, generally-available Gemini model. Overridable. */
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 45_000;
/** Hard cap on a single assistant reply, applied before it is persisted. */
export const GEMINI_MAX_RESPONSE_CHARS = 8000;

export type GeminiErrorKind =
  | 'NOT_CONFIGURED'
  | 'INVALID_KEY'
  | 'QUOTA'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'HTTP'
  | 'MALFORMED';

export class GeminiServiceError extends Error {
  readonly kind: GeminiErrorKind;
  constructor(kind: GeminiErrorKind, message: string) {
    super(message);
    this.name = 'GeminiServiceError';
    this.kind = kind;
  }
}

export interface GeminiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GeminiChatResult {
  content: string;
  model: string;
}

interface GeminiConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl: string;
}

function geminiConfig(): GeminiConfig {
  return {
    apiKey: (process.env.GEMINI_API_KEY || '').trim(),
    model: (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    baseUrl: (process.env.GEMINI_BASE_URL || '').trim(),
  };
}

/** True when a Gemini key is present, i.e. Gemini should be the active provider. */
export function isGeminiConfigured(): boolean {
  return geminiConfig().apiKey.length > 0;
}

/** The model this deployment would use (safe to surface; it is not a secret). */
export function geminiModelName(): string {
  return geminiConfig().model;
}

// One client per (key | baseUrl | timeout). Recreating is cheap and network-free,
// but caching keeps the SDK's internal state stable across requests.
let cachedClient: GoogleGenAI | null = null;
let cachedClientId = '';

function getClient(cfg: GeminiConfig): GoogleGenAI {
  const id = `${cfg.apiKey}|${cfg.baseUrl}|${cfg.timeoutMs}`;
  if (cachedClient && cachedClientId === id) return cachedClient;
  cachedClient = new GoogleGenAI({
    apiKey: cfg.apiKey,
    httpOptions: {
      timeout: cfg.timeoutMs,
      // Exactly one attempt: no SDK auto-retry. A failed call surfaces to the UI
      // immediately so a user message never triggers duplicate billable requests
      // and quota/rate-limit errors are reported honestly rather than retried.
      retryOptions: { attempts: 1 },
      ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
    },
  });
  cachedClientId = id;
  return cachedClient;
}

function looksLikeTimeout(err: any): boolean {
  const name = String(err?.name || '');
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  return /timed?\s*out|timeout|deadline exceeded/i.test(String(err?.message || ''));
}

/**
 * Map any SDK/transport failure to a small, safe, machine-readable kind.
 * The message never includes the API key or the raw provider payload.
 */
function classifyError(err: any, timeoutMs: number): GeminiServiceError {
  if (err instanceof GeminiServiceError) return err;

  const status = typeof err?.status === 'number' ? err.status : undefined;
  const raw = String(err?.message || '');

  if (status !== undefined) {
    if (status === 401 || status === 403) {
      return new GeminiServiceError('INVALID_KEY', 'The AI service rejected the configured API key.');
    }
    if (status === 429) {
      return new GeminiServiceError('QUOTA', 'The AI service quota or rate limit has been reached.');
    }
    if (status >= 500) {
      return new GeminiServiceError('HTTP', `The AI service responded with HTTP ${status}.`);
    }
    if (status === 400 && /api[_\s-]?key/i.test(raw)) {
      return new GeminiServiceError('INVALID_KEY', 'The AI service rejected the configured API key.');
    }
    return new GeminiServiceError('HTTP', `The AI service responded with HTTP ${status}.`);
  }

  if (looksLikeTimeout(err)) {
    return new GeminiServiceError('TIMEOUT', `The AI service did not respond within ${timeoutMs}ms.`);
  }

  // A 2xx response whose body could not be parsed (bad gateway / proxy HTML,
  // truncated JSON, etc.) reaches us as a parse error with no HTTP status.
  if (err instanceof SyntaxError || /json|unexpected token|unexpected end|parse/i.test(raw)) {
    return new GeminiServiceError('MALFORMED', 'The AI service returned an unexpected response.');
  }

  return new GeminiServiceError('UNAVAILABLE', 'The AI service is unreachable.');
}

/** Convert the portal's message list into the SDK's content shape. */
function toContents(messages: GeminiChatMessage[]): Content[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
}

function systemInstruction(messages: GeminiChatMessage[]): string | undefined {
  const parts = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content.trim())
    .filter(Boolean);
  return parts.length ? parts.join('\n\n') : undefined;
}

/**
 * Generate a single reply. Resolves with the assistant text, or throws a
 * `GeminiServiceError` whose `kind` the caller maps to an HTTP status.
 */
export async function chatWithGemini(
  messages: GeminiChatMessage[]
): Promise<GeminiChatResult> {
  const cfg = geminiConfig();
  if (!cfg.apiKey) {
    throw new GeminiServiceError(
      'NOT_CONFIGURED',
      'The Gemini API key is not configured on the server.'
    );
  }

  const contents = toContents(messages);
  if (contents.length === 0) {
    throw new GeminiServiceError('MALFORMED', 'No user message was provided to the AI service.');
  }

  try {
    const response = await getClient(cfg).models.generateContent({
      model: cfg.model,
      contents,
      config: {
        systemInstruction: systemInstruction(messages),
        temperature: 0.4,
        maxOutputTokens: 4096,
      },
    });

    const text = typeof response?.text === 'string' ? response.text.trim() : '';
    if (!text) {
      throw new GeminiServiceError('MALFORMED', 'The AI service returned an empty response.');
    }
    return { content: text.slice(0, GEMINI_MAX_RESPONSE_CHARS), model: cfg.model };
  } catch (err: any) {
    throw classifyError(err, cfg.timeoutMs);
  }
}

/**
 * Lightweight reachability + model probe. Uses `models.get` (metadata only, no
 * generation) so it never incurs a billable completion. Never throws.
 */
export async function checkGeminiAvailability(): Promise<{
  available: boolean;
  model: string;
  models: string[];
}> {
  const cfg = geminiConfig();
  if (!cfg.apiKey) return { available: false, model: cfg.model, models: [] };
  try {
    await getClient(cfg).models.get({ model: cfg.model });
    return { available: true, model: cfg.model, models: [cfg.model] };
  } catch {
    return { available: false, model: cfg.model, models: [] };
  }
}
