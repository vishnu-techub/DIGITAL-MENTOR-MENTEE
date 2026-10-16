/**
 * Broad deterministic grammar rules for the writing assistant.
 * ------------------------------------------------------------
 * These rules generalise the original curated sentence list: instead of storing
 * one corrected sentence per mistake, they operate on *reusable* patterns driven
 * by a small, safe lexicon (verb lemmas, subject sets, count nouns).
 *
 * Safety model (unchanged from the original engine):
 *   - a rule only fires when every word it touches is in a curated set;
 *   - only inflections the morphology module can prove are used;
 *   - ambiguous word forms ("found", "read") are never rewritten;
 *   - official values (numbers, codes, dates) never match any pattern here,
 *     because every pattern is built from letters and word boundaries.
 *
 * The function is pure: it returns the text plus a list of change notes, and the
 * caller decides whether to keep the result.
 */

import type { GrammarCategory } from './grammar.dataset.js';
import {
  ARTICLE_A_EXCEPTIONS,
  ARTICLE_AN_EXCEPTIONS,
  AGREEMENT_VERBS,
  COUNT_NOUNS,
  PLURAL_DETERMINERS,
  PLURAL_SUBJECTS,
  PROGRESSIVE_VERBS,
  SINGULAR_SUBJECTS,
} from './vocabulary/domain-vocabulary.js';
import {
  BASE_EQUALS_PAST,
  baseVerbOf,
  isPastForm,
  pastParticiple,
  pluralize,
  presentParticiple,
  thirdPerson,
  VERB_LEMMAS,
} from './vocabulary/morphology.js';

export interface RuleNote {
  category: GrammarCategory;
  label: string;
}

export interface RuleResult {
  corrected: string;
  notes: RuleNote[];
}

/** Verbs safe to use after have/has/had. Wider than the agreement set. */
const PERFECT_VERBS: ReadonlySet<string> = new Set<string>([
  ...AGREEMENT_VERBS,
  'eat', 'drink', 'sleep', 'bring', 'buy', 'catch', 'choose', 'drive', 'fall',
  'fight', 'find', 'fly', 'grow', 'hear', 'hide', 'hold', 'lose', 'meet',
  'pay', 'put', 'ride', 'send', 'sing', 'sit', 'spend', 'steal', 'swim',
  'teach', 'tell', 'throw', 'wear', 'win', 'break', 'forget', 'understand',
  'see', 'show', 'grow', 'know', 'draw', 'begin',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function alternation(values: Iterable<string>): string {
  return [...values]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
}

const SINGULAR_SUBJECT_ALT = alternation(SINGULAR_SUBJECTS);
const PLURAL_SUBJECT_ALT = alternation(PLURAL_SUBJECTS);
const COUNT_NOUN_ALT = alternation(COUNT_NOUNS);

/** More determiners than the plural set allows safely ("some student" is valid). */
const SAFE_PLURAL_DETERMINERS = alternation(
  [...PLURAL_DETERMINERS].filter((word) => word !== 'some')
);

/**
 * A zero-width guard placed immediately before a would-be plural subject. It
 * makes the engine ignore a plural noun that is really the *object* of "of":
 * in "one of the students has an arrear" the subject is "one", so the
 * "students has" pair must never be re-agreed.
 */
const OF_GUARD = '(?<!\\bof\\s)(?<!\\bof\\sthe\\s)';

/**
 * Quantifiers that are always followed by a plural noun in an "of the"-phrase
 * ("one of the students", "none of the students"). Only discrete count nouns
 * are used, so a collective like "most of the class" is never reworded.
 */
const OF_PHRASE_QUANTIFIERS = 'one|each|none|either|neither';
const OF_PHRASE_NOUN_ALT = alternation(
  [...COUNT_NOUNS].filter((noun) => noun !== 'class')
);

// ---------------------------------------------------------------------------
// Individual rules. Each mutates the shared `notes` array and returns the text.
// ---------------------------------------------------------------------------

/**
 * A modal / infinitive marker / do-auxiliary takes the bare infinitive:
 *   "to submitted" -> "to submit", "did not went" -> "did not go".
 * After "to" a gerund is left alone ("look forward to meeting you").
 */
function fixBareInfinitive(str: string, notes: RuleNote[]): string {
  const pattern = /\b(to|can|could|will|would|shall|should|may|might|must|do|does|did)\s+(not\s+)?([a-z]+)\b/gi;
  let changedAny = false;
  const out = str.replace(pattern, (match, aux: string, neg: string | undefined, word: string) => {
    const lower = word.toLowerCase();
    if (aux.toLowerCase() === 'to' && /ing$/.test(lower)) return match;
    const base = baseVerbOf(lower);
    if (!base || base === lower) return match;
    changedAny = true;
    return neg ? `${aux} not ${base}` : `${aux} ${base}`;
  });
  if (changedAny) notes.push({ category: 'sentence-structure', label: 'verb form after modal/to/do-auxiliary' });
  return out;
}

/**
 * have / has / had take a past participle:
 *   "has go" -> "has gone", "have wrote" -> "have written".
 */
function fixPerfectTense(str: string, notes: RuleNote[]): string {
  const pattern = /\b(have|has|had|haven't|hasn't|hadn't)\s+(not\s+)?([a-z]+)\b/gi;
  let changedAny = false;
  const out = str.replace(pattern, (match, aux: string, neg: string | undefined, word: string) => {
    const lower = word.toLowerCase();
    const base = VERB_LEMMAS.has(lower) ? lower : baseVerbOf(lower);
    if (!base || !PERFECT_VERBS.has(base)) return match;
    const participle = pastParticiple(base);
    if (participle === lower) return match;
    changedAny = true;
    return neg ? `${aux} not ${participle}` : `${aux} ${participle}`;
  });
  if (changedAny) notes.push({ category: 'sentence-structure', label: 'have/has/had + past participle' });
  return out;
}

/**
 * be takes a present participle for an action verb:
 *   "he is go" -> "he is going", "they are study" -> "they are studying".
 */
function fixProgressive(str: string, notes: RuleNote[]): string {
  const pattern = /\b(is|are|was|were|am)\s+(not\s+)?([a-z]+)\b/gi;
  let changedAny = false;
  const out = str.replace(pattern, (match, aux: string, neg: string | undefined, word: string) => {
    const lower = word.toLowerCase();
    if (!PROGRESSIVE_VERBS.has(lower)) return match;
    const ing = presentParticiple(lower);
    if (ing === lower) return match;
    changedAny = true;
    return neg ? `${aux} not ${ing}` : `${aux} ${ing}`;
  });
  if (changedAny) notes.push({ category: 'sentence-structure', label: 'be + present participle' });
  return out;
}

/**
 * Singular subject-verb agreement for a curated verb:
 *   "he go" -> "he goes", "student need" -> "student needs".
 * A verb whose past is identical to its base ("read", "put") is skipped so a
 * correct past tense is never rewritten.
 */
function fixSingularAgreement(str: string, notes: RuleNote[]): string {
  const pattern = new RegExp(`\\b(${SINGULAR_SUBJECT_ALT})\\s+(not\\s+)?([a-z]+)\\b`, 'gi');
  let changedAny = false;
  const out = str.replace(pattern, (match, subject: string, neg: string | undefined, word: string) => {
    const lower = word.toLowerCase();
    if (!AGREEMENT_VERBS.has(lower) || BASE_EQUALS_PAST.has(lower)) return match;
    const third = thirdPerson(lower);
    if (third === lower) return match;
    changedAny = true;
    return neg ? `${subject} not ${third}` : `${subject} ${third}`;
  });
  if (changedAny) notes.push({ category: 'subject-verb', label: 'singular subject + base verb' });
  return out;
}

/** Plural determiners require a plural count noun: "many student" -> "many students". */
function fixQuantifierPlurals(str: string, notes: RuleNote[]): string {
  const pattern = new RegExp(`\\b(${SAFE_PLURAL_DETERMINERS})\\s+(${COUNT_NOUN_ALT})\\b`, 'gi');
  let changedAny = false;
  const out = str.replace(pattern, (match, determiner: string, noun: string) => {
    const lower = noun.toLowerCase();
    const plural = pluralize(lower);
    if (plural === lower) return match;
    changedAny = true;
    const cased =
      noun[0] === noun[0].toUpperCase() ? plural.charAt(0).toUpperCase() + plural.slice(1) : plural;
    return `${determiner} ${cased}`;
  });
  if (changedAny) notes.push({ category: 'subject-verb', label: 'plural determiner + plural noun' });
  return out;
}

/**
 * A partitive quantifier takes a plural count noun: "one of the student" ->
 * "one of the students", "none of the student attended" -> "... students".
 * Only discrete count nouns are touched, so a collective ("most of the class")
 * is left alone.
 */
function fixOfPhrasePlurals(str: string, notes: RuleNote[]): string {
  const pattern = new RegExp(
    `\\b(${OF_PHRASE_QUANTIFIERS})\\s+of\\s+the\\s+(${OF_PHRASE_NOUN_ALT})\\b`,
    'gi'
  );
  let changedAny = false;
  const out = str.replace(pattern, (match, quantifier: string, noun: string) => {
    const lower = noun.toLowerCase();
    const plural = pluralize(lower);
    if (plural === lower) return match;
    changedAny = true;
    const cased =
      noun[0] === noun[0].toUpperCase() ? plural.charAt(0).toUpperCase() + plural.slice(1) : plural;
    return `${quantifier} of the ${cased}`;
  });
  if (changedAny) notes.push({ category: 'subject-verb', label: 'quantifier + "of the" + plural noun' });
  return out;
}

/**
 * A clause that jumps straight from a subject to "not" + simple past is missing
 * its "did" auxiliary: "student not submitted assignment" -> "The student did
 * not submit assignment". Only a curated subject at a clause start and a known
 * simple-past verb are touched; present participles ("not attending") are the
 * business of `fixMissingAuxiliaryVerbs`, and an already-correct past clause
 * always has its auxiliary, so it never matches.
 */
function fixMissingPastAuxiliary(str: string, notes: RuleNote[]): string {
  const nounSubjects = 'student|mentee|teacher|mentor|boy|girl|child|person';
  const pronounSubjects = 'he|she|it|they|we|you|i';
  const pattern = new RegExp(
    `(^|[.!?]\\s+)(the\\s+)?(${nounSubjects}|${pronounSubjects})\\s+not\\s+([a-z]+)\\b`,
    'gi'
  );
  let changedAny = false;
  const out = str.replace(
    pattern,
    (match, prefix: string, _article: string | undefined, subject: string, word: string) => {
      const lower = word.toLowerCase();
      if (/ing$/.test(lower)) return match;
      if (!isPastForm(lower)) return match;
      const base = baseVerbOf(lower);
      if (!base || !AGREEMENT_VERBS.has(base)) return match;

      const isNoun = new RegExp(`^(?:${nounSubjects})$`, 'i').test(subject);
      // For a noun, rebuild a clean "The student" (any existing "the" is consumed
      // by the match, so this never doubles an article). Pronouns need no article.
      const subjectOut = isNoun
        ? `The ${subject.toLowerCase()}`
        : subject.charAt(0).toUpperCase() + subject.slice(1);
      changedAny = true;
      return `${prefix}${subjectOut} did not ${base}`;
    }
  );
  if (changedAny) notes.push({ category: 'sentence-structure', label: 'inserted a missing "did" auxiliary' });
  return out;
}

/**
 * Plural subject-verb agreement plus the closed-class be/have forms:
 *   "they goes" -> "they go", "they is" -> "they are", "i are" -> "I am".
 *
 * The `OF_GUARD` stops a plural noun that is the object of a preposition from
 * being treated as the subject: in "one of the students has an arrear" the
 * subject is "one", so "students has" must be left alone.
 */
function fixPluralAgreement(str: string, notes: RuleNote[]): string {
  let changedAny = false;

  const pluralVerb = new RegExp(`${OF_GUARD}\\b(${PLURAL_SUBJECT_ALT})\\s+(not\\s+)?([a-z]+)\\b`, 'gi');
  let out = str.replace(pluralVerb, (match, subject: string, neg: string | undefined, word: string) => {
    const lower = word.toLowerCase();
    const base = baseVerbOf(lower);
    if (!base || !AGREEMENT_VERBS.has(base)) return match;
    if (thirdPerson(base) !== lower) return match;
    changedAny = true;
    return neg ? `${subject} not ${base}` : `${subject} ${base}`;
  });

  const closed: ReadonlyArray<readonly [RegExp, string, string]> = [
    [/\bthere is (many|several|few|both|two|three|four|five|six|seven|eight|nine|ten)\b/gi, 'there are $1', 'there is + plural quantifier -> there are'],
    [new RegExp(`${OF_GUARD}\\bthere is (students|mentees|teachers|books|issues|problems|arrears|classes|marks|doubts|members|people)\\b`, 'gi'), 'there are $1', 'there is + plural noun -> there are'],
    [/\bthere was (many|several|few|students|mentees|issues|problems|people)\b/gi, 'there were $1', 'there was + plural -> there were'],
    [new RegExp(`${OF_GUARD}\\b(${PLURAL_SUBJECT_ALT})\\s+is\\b`, 'gi'), '$1 are', 'plural subject + is -> are'],
    [new RegExp(`${OF_GUARD}\\b(${PLURAL_SUBJECT_ALT})\\s+has\\b`, 'gi'), '$1 have', 'plural subject + has -> have'],
    [new RegExp(`${OF_GUARD}\\b(${PLURAL_SUBJECT_ALT})\\s+was\\b`, 'gi'), '$1 were', 'plural subject + was -> were'],
    [/\bi\s+is\b/gi, 'I am', 'I + is -> am'],
    [/\bi\s+are\b/gi, 'I am', 'I + are -> am'],
    [/\b(he|she|it|student|mentee|child|person|everyone|everybody|someone|somebody|nobody|each)\s+are\b/gi, '$1 is', 'singular subject + are -> is'],
    [/\b(he|she|it|student|mentee|child|person|everyone|everybody|someone|somebody|nobody|each)\s+were\b/gi, '$1 was', 'singular subject + were -> was'],
  ];
  for (const [pattern, replacement, label] of closed) {
    const before = out;
    out = out.replace(pattern, replacement);
    if (out !== before) {
      changedAny = true;
      notes.push({ category: 'subject-verb', label });
    }
  }

  return out;
}

/** The a/an rule: pick the article that matches the following word's sound. */
function fixArticles(str: string, notes: RuleNote[]): string {
  let changedAny = false;
  const pattern = /\b(a|an)\s+([A-Za-z][A-Za-z.'-]*)/g;
  const out = str.replace(pattern, (match, article: string, word: string) => {
    const wantsAn = needsAn(word);
    const articleLower = article.toLowerCase();
    if (articleLower === 'an' && wantsAn) return match;
    if (articleLower === 'a' && !wantsAn) return match;
    changedAny = true;
    const replacement = wantsAn ? 'an' : 'a';
    const cased =
      article[0] === article[0].toUpperCase()
        ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
        : replacement;
    return `${cased} ${word}`;
  });
  if (changedAny) notes.push({ category: 'articles', label: 'a/an agreement' });
  return out;
}

function needsAn(word: string): boolean {
  // Acronyms are judged by the sound of their first letter ("an MBA", "a PhD").
  if (/^[A-Z]{2,}/.test(word)) {
    return /^[AEFHILMNORSX]/.test(word[0]);
  }
  const lower = word.toLowerCase();
  if (/^[aeiou]/.test(lower)) {
    if (ARTICLE_A_EXCEPTIONS.has(lower)) return false;
    return !/^(uni|use|usu|uti|uran|urine|euro|ewe|once|one|ubi|unan|unic|unif|unil|uke|usur)/.test(
      lower
    );
  }
  if (ARTICLE_AN_EXCEPTIONS.has(lower)) return true;
  return /^(hour|honest|honou?r|heir|herb)/.test(lower);
}

/** Extra preposition / structure fixes that are unambiguous in every context. */
const EXTRA_PHRASE_RULES: ReadonlyArray<readonly [RegExp, string, GrammarCategory, string]> = [
  [/\bafraid from\b/gi, 'afraid of', 'prepositions', 'afraid from -> afraid of'],
  [/\bmarried with\b/gi, 'married to', 'prepositions', 'married with -> married to'],
  [/\bsuperior than\b/gi, 'superior to', 'prepositions', 'superior than -> superior to'],
  [/\bdifferent than\b/gi, 'different from', 'prepositions', 'different than -> different from'],
  [/\bcomprise of\b/gi, 'comprise', 'prepositions', 'comprise of -> comprise'],
  [/\bconcentrate in\b/gi, 'concentrate on', 'prepositions', 'concentrate in -> concentrate on'],
  [/\bfocus in\b/gi, 'focus on', 'prepositions', 'focus in -> focus on'],
  [/\bdepend of\b/gi, 'depend on', 'prepositions', 'depend of -> depend on'],
  [/\bdepends of\b/gi, 'depends on', 'prepositions', 'depends of -> depends on'],
  [/\bdepended of\b/gi, 'depended on', 'prepositions', 'depended of -> depended on'],
  [/\bdepending of\b/gi, 'depending on', 'prepositions', 'depending of -> depending on'],
  [/\b(suffer|suffers|suffered)\s+with\b/gi, '$1 from', 'prepositions', 'suffer with -> suffer from'],
  [/\bangry on\b/gi, 'angry with', 'prepositions', 'angry on -> angry with'],
  [/\breached to\b/gi, 'reached', 'prepositions', 'reached to -> reached'],
  [/\breach to\b/gi, 'reach', 'prepositions', 'reach to -> reach'],
  [/\breply back\b/gi, 'reply', 'sentence-structure', 'reply back -> reply'],
  [/\brepeat again\b/gi, 'repeat', 'sentence-structure', 'repeat again -> repeat'],
  [/\b(listen|listens|listened)\s+(to\s+)?music\b/gi, '$1 to music', 'prepositions', 'listen music -> listen to music'],
  [/\binspite of\b/gi, 'in spite of', 'prepositions', 'inspite of -> in spite of'],
  [/\bthe both\b/gi, 'both', 'sentence-structure', 'the both -> both'],
  [/\bmost best\b/gi, 'best', 'sentence-structure', 'most best -> best'],
  [/\bmore easier\b/gi, 'easier', 'sentence-structure', 'more easier -> easier'],
  [/\bmore faster\b/gi, 'faster', 'sentence-structure', 'more faster -> faster'],
  [/\bcan able to\b/gi, 'can', 'sentence-structure', 'can able to -> can'],
  [/\bneed not to\b/gi, 'need not', 'sentence-structure', 'need not to -> need not'],
  [/\bdue to the fact that\b/gi, 'because', 'sentence-structure', 'due to the fact that -> because'],
  [
    /\b(he|she|it|student|mentee|child|person)\s+is\s+having\s+((?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|several|many|\d+)\s+arrears?)\b/gi,
    '$1 has $2',
    'subject-verb',
    'is having + <count> arrear(s) -> has',
  ],
  [
    /\b(they|we|you|students|mentees|children|people)\s+are\s+having\s+((?:one|two|three|four|five|six|seven|eight|nine|ten|several|many|\d+)\s+arrears?)\b/gi,
    '$1 have $2',
    'subject-verb',
    'are having + <count> arrear(s) -> have',
  ],
];

function applyExtraPhraseRules(str: string, notes: RuleNote[]): string {
  let out = str;
  for (const [pattern, replacement, category, label] of EXTRA_PHRASE_RULES) {
    const before = out;
    out = out.replace(pattern, replacement);
    if (out !== before) notes.push({ category, label });
  }
  return out;
}

/**
 * A verb that only takes a "to"-infinitive is followed directly by a bare verb
 * ("he want improve") -> insert the missing "to" ("he wants to improve"). The
 * following word must be an unambiguous verb, so "need help" is never touched.
 */
function fixMissingInfinitiveTo(str: string, notes: RuleNote[]): string {
  const triggers = 'want|wants|plan|plans|hope|hopes|expect|expects|decide|decides|choose|chooses|forget|forgets|forgot|try|tries|tried|agree|agrees|wish|wishes';
  const targets = 'improve|attend|submit|complete|participate|prepare|study|learn|practice|practise|revise|score|maintain|develop|solve|achieve|perform|join|apply|discuss';
  const pattern = new RegExp(`\\b(${triggers})\\s+(${targets})\\b`, 'gi');
  let changedAny = false;
  const out = str.replace(pattern, (match, trigger: string, target: string) => {
    changedAny = true;
    return `${trigger} to ${target}`;
  });
  if (changedAny) notes.push({ category: 'sentence-structure', label: 'inserted a missing "to" before the infinitive' });
  return out;
}

/** Collapse an accidentally doubled function word: "the the" -> "the". */
function fixDoubledWords(str: string, notes: RuleNote[]): string {
  const words = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'and', 'or'];
  let out = str;
  let changedAny = false;
  for (const word of words) {
    const pattern = new RegExp(`\\b(${word})\\s+${word}\\b`, 'gi');
    const before = out;
    out = out.replace(pattern, '$1');
    if (out !== before) changedAny = true;
  }
  if (changedAny) notes.push({ category: 'sentence-structure', label: 'removed a duplicated word' });
  return out;
}

/**
 * Run every advanced rule in a deliberate order and report what changed.
 * Order matters: verb-form fixes run before agreement, and the plural
 * determiner rule runs before plural agreement so "many student have" is fully
 * repaired ("many students have").
 */
export function applyAdvancedRules(text: string): RuleResult {
  const notes: RuleNote[] = [];
  if (!text) return { corrected: text, notes };

  let str = text;
  str = fixBareInfinitive(str, notes);
  str = fixPerfectTense(str, notes);
  str = fixProgressive(str, notes);
  str = fixDoubledWords(str, notes);
  str = fixMissingPastAuxiliary(str, notes);
  str = fixSingularAgreement(str, notes);
  str = fixQuantifierPlurals(str, notes);
  str = fixOfPhrasePlurals(str, notes);
  str = fixPluralAgreement(str, notes);
  str = fixMissingInfinitiveTo(str, notes);
  str = fixArticles(str, notes);
  str = applyExtraPhraseRules(str, notes);

  return { corrected: str, notes };
}
