/**
 * Optional local language-model adapter for context-aware correction.
 * -------------------------------------------------------------------
 * The deterministic engine is the default and needs no model. When a local
 * Ollama server is configured, this adapter offers a *broader* proofreading
 * pass for sentences the deterministic rules deliberately leave alone.
 *
 * It is OFF by default and never assumes a model exists:
 *   - enable with `GRAMMAR_LOCAL_MODEL=true` (or `1`/`on`);
 *   - endpoint/model are read from the shared `OLLAMA_BASE_URL` /
 *     `OLLAMA_MODEL` / `OLLAMA_TIMEOUT_MS` variables (see
 *     `backend/src/services/ollama.service.ts`);
 *   - any failure (unreachable, timeout, malformed, empty) returns `null`, so
 *     the caller silently falls back to the deterministic engine.
 *
 * The output is validated by the caller (`preservesProtectedValues`,
 * `sanitizeLlmOutput`) before it can ever be shown, exactly like the existing
 * external-provider path.
 *
 * Setup instructions and hardware notes are recorded in PROJECT_PROGRESS.md.
 * No model is installed on this machine, so this path is verified with a local
 * mock server rather than a real model (see `grammar-context.test.ts`).
 */

import { chatWithOllama } from '../../services/ollama.service.js';

const SYSTEM_PROMPT = `You are a careful English proofreader for a college mentor's counselling notes.
Correct only spelling, grammar, punctuation and capitalisation.

Rules:
1. NEVER change names, register numbers, subject codes, dates, marks, CGPA/SGPA, percentages or identifiers. Copy every one of them character for character.
2. Never add or remove facts. Preserve the writer's intended meaning exactly.
3. Output ONLY the corrected text. No quotes, no labels, no explanation, no markdown.
4. If the text is already correct, return it unchanged.`;

/** True only when the adapter has been explicitly switched on by configuration. */
export function localGrammarModelEnabled(): boolean {
  const flag = (process.env.GRAMMAR_LOCAL_MODEL || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on' || flag === 'yes';
}

/**
 * Ask the local model for a corrected version of `text`. Returns `null` when the
 * adapter is disabled or the model cannot be reached / produces nothing usable.
 */
export async function localModelGrammarSuggestion(text: string): Promise<string | null> {
  if (!localGrammarModelEnabled()) return null;
  if (!text || text.length < 8) return null;

  try {
    const result = await chatWithOllama([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ]);
    const content = result?.content?.trim();
    return content && content.length > 0 ? content : null;
  } catch {
    // UNAVAILABLE / TIMEOUT / HTTP / MALFORMED all degrade to the deterministic
    // engine; the user never sees a provider error.
    return null;
  }
}
