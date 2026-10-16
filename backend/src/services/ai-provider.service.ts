/**
 * ============================================================================
 * AI PROVIDER SELECTOR — KSRCE AI Assistant
 * ============================================================================
 *
 * The chat controller talks to ONE function, `generateAiReply`, and never needs
 * to know which vendor answers. Selection is deterministic and configuration
 * driven:
 *
 *   GEMINI_API_KEY set   -> Google Gemini (official @google/genai SDK)
 *   GEMINI_API_KEY empty -> the existing local Ollama server (unchanged)
 *
 * There is deliberately NO silent cross-provider fallback: if the selected
 * provider fails we surface a real error (mapped to a status the UI can render)
 * instead of quietly answering from a different model or a canned template.
 * That keeps responses honest — the bot never pretends it answered when it did
 * not — and keeps a user message to at most one billable upstream request.
 */

import {
  chatWithOllama,
  checkOllamaAvailability,
  OllamaServiceError,
} from './ollama.service.js';
import {
  chatWithGemini,
  checkGeminiAvailability,
  isGeminiConfigured,
  GeminiServiceError,
} from './gemini.service.js';

export type AiProviderName = 'gemini' | 'ollama';

export type AiErrorKind =
  | 'NOT_CONFIGURED'
  | 'INVALID_KEY'
  | 'QUOTA'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'HTTP'
  | 'MALFORMED';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatResult {
  content: string;
  model: string;
  provider: AiProviderName;
}

export interface AiStatus {
  available: boolean;
  model: string;
  models: string[];
  provider: AiProviderName;
  configured: boolean;
}

export class AiProviderError extends Error {
  readonly kind: AiErrorKind;
  readonly provider: AiProviderName;
  constructor(provider: AiProviderName, kind: AiErrorKind, message: string) {
    super(message);
    this.name = 'AiProviderError';
    this.provider = provider;
    this.kind = kind;
  }
}

/** The provider that will answer the next request. */
export function activeAiProvider(): AiProviderName {
  if (isGeminiConfigured()) return 'gemini';
  if (process.env.OLLAMA_BASE_URL) return 'ollama';
  return 'gemini';
}

/** Provider availability for `GET /api/ai/status` (never throws). */
export async function getAiProviderStatus(): Promise<AiStatus> {
  if (isGeminiConfigured()) {
    const status = await checkGeminiAvailability();
    return { ...status, provider: 'gemini', configured: true };
  }
  if (process.env.OLLAMA_BASE_URL) {
    const status = await checkOllamaAvailability();
    return { ...status, provider: 'ollama', configured: true };
  }
  return {
    available: false,
    model: 'gemini-2.5-flash',
    models: [],
    provider: 'gemini',
    configured: false,
  };
}

/** HTTP status for a failure kind. Matches the historical Ollama mapping. */
export function aiErrorStatus(kind: AiErrorKind): number {
  switch (kind) {
    case 'TIMEOUT':
      return 504;
    case 'QUOTA':
      return 429;
    case 'HTTP':
      return 502;
    // NOT_CONFIGURED / INVALID_KEY / UNAVAILABLE / MALFORMED
    default:
      return 503;
  }
}

/**
 * A safe, helpful, user-facing message per failure kind. Never contains the API
 * key, provider hostnames, stack traces or raw payloads.
 */
export function aiErrorMessage(kind: AiErrorKind): string {
  switch (kind) {
    case 'QUOTA':
      return 'The AI assistant has reached its usage limit for now. Please try again later.';
    case 'INVALID_KEY':
      return 'The AI service rejected the configured API key. Please check your GEMINI_API_KEY configuration.';
    case 'NOT_CONFIGURED':
      return 'The AI assistant is not configured on the server. Please configure GEMINI_API_KEY in the backend environment.';
    case 'TIMEOUT':
      return 'The AI assistant took too long to respond. Please try again.';
    case 'HTTP':
      return 'The AI service is temporarily unavailable. Please try again shortly.';
    case 'MALFORMED':
      return 'The AI service returned an unexpected response. Please try again.';
    case 'UNAVAILABLE':
    default:
      return 'The AI service is currently unreachable. Please try again shortly.';
  }
}

/**
 * Send the transcript to the active provider and return its reply.
 * Throws `AiProviderError` on any failure (never a fake answer).
 */
export async function generateAiReply(messages: AiChatMessage[]): Promise<AiChatResult> {
  if (isGeminiConfigured()) {
    try {
      const result = await chatWithGemini(messages);
      return { content: result.content, model: result.model, provider: 'gemini' };
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        const kind = normalizeKind(err.kind);
        throw new AiProviderError('gemini', kind, aiErrorMessage(kind));
      }
      throw new AiProviderError('gemini', 'UNAVAILABLE', aiErrorMessage('UNAVAILABLE'));
    }
  }

  // If Gemini is not configured, fall back to Ollama only if explicitly configured in environment
  if (!process.env.OLLAMA_BASE_URL) {
    throw new AiProviderError('gemini', 'NOT_CONFIGURED', aiErrorMessage('NOT_CONFIGURED'));
  }

  try {
    const result = await chatWithOllama(messages);
    return { content: result.content, model: result.model, provider: 'ollama' };
  } catch (err) {
    if (err instanceof OllamaServiceError) {
      // Surface the same safe, provider-agnostic copy as the Gemini path so the
      // internal provider name ("Ollama") is never leaked to the browser.
      const kind = normalizeKind(err.kind);
      throw new AiProviderError('ollama', kind, aiErrorMessage(kind));
    }
    throw new AiProviderError('ollama', 'UNAVAILABLE', aiErrorMessage('UNAVAILABLE'));
  }
}

/** Clamp an arbitrary provider kind into the shared enum. */
function normalizeKind(kind: unknown): AiErrorKind {
  const allowed: AiErrorKind[] = [
    'NOT_CONFIGURED',
    'INVALID_KEY',
    'QUOTA',
    'UNAVAILABLE',
    'TIMEOUT',
    'HTTP',
    'MALFORMED',
  ];
  return allowed.includes(kind as AiErrorKind) ? (kind as AiErrorKind) : 'UNAVAILABLE';
}
