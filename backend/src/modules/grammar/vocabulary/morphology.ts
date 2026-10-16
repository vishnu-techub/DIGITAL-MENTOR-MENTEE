/**
 * English morphology helpers for the grammar engine.
 * --------------------------------------------------
 * The engine needs to know *which* inflected word forms exist so it can safely
 * decide that a form is a verb form ("submitted" -> "submit") without ever
 * guessing. This module is pure data + pure functions and has no I/O, so it is
 * cheap to import and trivial to test.
 *
 * Everything here is a statement of fact about English (irregular verb parts,
 * plural formation, final-consonant doubling). It is written by hand and is not
 * derived from any copyrighted word list. The large vocabulary list that uses
 * these helpers to validate ordinary words lives in `lexicon.ts` and is
 * documented, with its licence, in `data/SOURCES.md`.
 *
 * Design notes:
 *   - Only forms that map back to a *single* base verb are published in
 *     `FORM_TO_BASE`. An ambiguous form ("found" = attach/establish) is dropped
 *     rather than guessed, so a rule can never turn one word into another.
 *   - Regular inflections cover the overwhelming majority of verbs; a curated
 *     `DOUBLE_FINAL` set handles the CVC verbs that double their last letter.
 */

/** Irregular verbs: base -> [simple past, past participle]. */
const IRREGULAR_VERBS: ReadonlyArray<readonly [string, string, string]> = [
  ['arise', 'arose', 'arisen'],
  ['awake', 'awoke', 'awoken'],
  ['bear', 'bore', 'borne'],
  ['beat', 'beat', 'beaten'],
  ['become', 'became', 'become'],
  ['begin', 'began', 'begun'],
  ['bend', 'bent', 'bent'],
  ['bet', 'bet', 'bet'],
  ['bind', 'bound', 'bound'],
  ['bite', 'bit', 'bitten'],
  ['bleed', 'bled', 'bled'],
  ['blow', 'blew', 'blown'],
  ['break', 'broke', 'broken'],
  ['bring', 'brought', 'brought'],
  ['build', 'built', 'built'],
  ['burn', 'burnt', 'burnt'],
  ['burst', 'burst', 'burst'],
  ['buy', 'bought', 'bought'],
  ['catch', 'caught', 'caught'],
  ['choose', 'chose', 'chosen'],
  ['cling', 'clung', 'clung'],
  ['come', 'came', 'come'],
  ['cost', 'cost', 'cost'],
  ['creep', 'crept', 'crept'],
  ['cut', 'cut', 'cut'],
  ['deal', 'dealt', 'dealt'],
  ['dig', 'dug', 'dug'],
  ['do', 'did', 'done'],
  ['draw', 'drew', 'drawn'],
  ['drink', 'drank', 'drunk'],
  ['drive', 'drove', 'driven'],
  ['eat', 'ate', 'eaten'],
  ['fall', 'fell', 'fallen'],
  ['feed', 'fed', 'fed'],
  ['feel', 'felt', 'felt'],
  ['fight', 'fought', 'fought'],
  ['find', 'found', 'found'],
  ['flee', 'fled', 'fled'],
  ['fling', 'flung', 'flung'],
  ['fly', 'flew', 'flown'],
  ['forbid', 'forbade', 'forbidden'],
  ['forget', 'forgot', 'forgotten'],
  ['forgive', 'forgave', 'forgiven'],
  ['freeze', 'froze', 'frozen'],
  ['get', 'got', 'got'],
  ['give', 'gave', 'given'],
  ['go', 'went', 'gone'],
  ['grind', 'ground', 'ground'],
  ['grow', 'grew', 'grown'],
  ['hang', 'hung', 'hung'],
  ['have', 'had', 'had'],
  ['hear', 'heard', 'heard'],
  ['hide', 'hid', 'hidden'],
  ['hit', 'hit', 'hit'],
  ['hold', 'held', 'held'],
  ['hurt', 'hurt', 'hurt'],
  ['keep', 'kept', 'kept'],
  ['kneel', 'knelt', 'knelt'],
  ['know', 'knew', 'known'],
  ['lay', 'laid', 'laid'],
  ['lead', 'led', 'led'],
  ['lean', 'leant', 'leant'],
  ['leap', 'leapt', 'leapt'],
  ['learn', 'learnt', 'learnt'],
  ['leave', 'left', 'left'],
  ['lend', 'lent', 'lent'],
  ['let', 'let', 'let'],
  ['lie', 'lay', 'lain'],
  ['light', 'lit', 'lit'],
  ['lose', 'lost', 'lost'],
  ['make', 'made', 'made'],
  ['mean', 'meant', 'meant'],
  ['meet', 'met', 'met'],
  ['mistake', 'mistook', 'mistaken'],
  ['overcome', 'overcame', 'overcome'],
  ['pay', 'paid', 'paid'],
  ['put', 'put', 'put'],
  ['quit', 'quit', 'quit'],
  ['read', 'read', 'read'],
  ['ride', 'rode', 'ridden'],
  ['ring', 'rang', 'rung'],
  ['rise', 'rose', 'risen'],
  ['run', 'ran', 'run'],
  ['say', 'said', 'said'],
  ['see', 'saw', 'seen'],
  ['seek', 'sought', 'sought'],
  ['sell', 'sold', 'sold'],
  ['send', 'sent', 'sent'],
  ['set', 'set', 'set'],
  ['sew', 'sewed', 'sewn'],
  ['shake', 'shook', 'shaken'],
  ['shine', 'shone', 'shone'],
  ['shoot', 'shot', 'shot'],
  ['show', 'showed', 'shown'],
  ['shrink', 'shrank', 'shrunk'],
  ['shut', 'shut', 'shut'],
  ['sing', 'sang', 'sung'],
  ['sink', 'sank', 'sunk'],
  ['sit', 'sat', 'sat'],
  ['sleep', 'slept', 'slept'],
  ['slide', 'slid', 'slid'],
  ['speak', 'spoke', 'spoken'],
  ['speed', 'sped', 'sped'],
  ['spell', 'spelt', 'spelt'],
  ['spend', 'spent', 'spent'],
  ['spill', 'spilt', 'spilt'],
  ['spin', 'spun', 'spun'],
  ['spit', 'spat', 'spat'],
  ['split', 'split', 'split'],
  ['spread', 'spread', 'spread'],
  ['spring', 'sprang', 'sprung'],
  ['stand', 'stood', 'stood'],
  ['steal', 'stole', 'stolen'],
  ['stick', 'stuck', 'stuck'],
  ['sting', 'stung', 'stung'],
  ['strike', 'struck', 'struck'],
  ['swear', 'swore', 'sworn'],
  ['sweep', 'swept', 'swept'],
  ['swim', 'swam', 'swum'],
  ['swing', 'swung', 'swung'],
  ['take', 'took', 'taken'],
  ['teach', 'taught', 'taught'],
  ['tear', 'tore', 'torn'],
  ['tell', 'told', 'told'],
  ['think', 'thought', 'thought'],
  ['throw', 'threw', 'thrown'],
  ['understand', 'understood', 'understood'],
  ['undertake', 'undertook', 'undertaken'],
  ['upset', 'upset', 'upset'],
  ['wake', 'woke', 'woken'],
  ['wear', 'wore', 'worn'],
  ['weep', 'wept', 'wept'],
  ['win', 'won', 'won'],
  ['wind', 'wound', 'wound'],
  ['withdraw', 'withdrew', 'withdrawn'],
  ['write', 'wrote', 'written'],
];

/**
 * Alternative past / participle spellings that are every bit as common as the
 * irregular form above and must map back to the same base. The project uses
 * British spellings ("counselling", "behaviour"), but Indian academic writing
 * mixes both, so both are accepted as *inputs*.
 */
const IRREGULAR_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['burned', 'burn'],
  ['dreamed', 'dream'],
  ['dreamt', 'dream'],
  ['learned', 'learn'],
  ['leaned', 'lean'],
  ['leaped', 'leap'],
  ['spelled', 'spell'],
  ['spilled', 'spill'],
  ['kneeled', 'kneel'],
  ['gotten', 'get'],
  ['proven', 'prove'],
];

/**
 * Verbs whose final consonant doubles before -ed / -ing. Curated because the
 * doubling rule in English depends on syllable stress, which cannot be derived
 * from spelling alone.
 */
const DOUBLE_FINAL: ReadonlySet<string> = new Set([
  'admit', 'begin', 'cancel', 'chat', 'commit', 'compel', 'control', 'cut',
  'drop', 'equip', 'expel', 'fit', 'forbid', 'forget', 'format', 'get', 'grab',
  'hit', 'jog', 'label', 'level', 'let', 'marvel', 'model', 'occur', 'permit',
  'plan', 'prefer', 'propel', 'put', 'quit', 'rebel', 'refer', 'regret', 'rot',
  'run', 'scan', 'set', 'shop', 'signal', 'sit', 'skip', 'slip', 'spot', 'stir',
  'stop', 'strip', 'submit', 'swap', 'tap', 'transfer', 'travel', 'trim',
  'trip', 'upset', 'win', 'wrap',
]);

/** Irregular noun plurals: singular -> plural. */
const IRREGULAR_PLURALS: Readonly<Record<string, string>> = {
  child: 'children',
  person: 'people',
  man: 'men',
  woman: 'women',
  foot: 'feet',
  tooth: 'teeth',
  goose: 'geese',
  mouse: 'mice',
  ox: 'oxen',
  datum: 'data',
  criterion: 'criteria',
  phenomenon: 'phenomena',
  medium: 'media',
  curriculum: 'curricula',
  syllabus: 'syllabi',
  analysis: 'analyses',
  basis: 'bases',
  crisis: 'crises',
  thesis: 'theses',
  hypothesis: 'hypotheses',
  diagnosis: 'diagnoses',
  synthesis: 'syntheses',
  appendix: 'appendices',
  index: 'indices',
  matrix: 'matrices',
  alumnus: 'alumni',
  cactus: 'cacti',
  fungus: 'fungi',
  nucleus: 'nuclei',
  radius: 'radii',
  stimulus: 'stimuli',
  focus: 'foci',
  sheep: 'sheep',
  series: 'series',
  species: 'species',
  deer: 'deer',
  fish: 'fish',
  aircraft: 'aircraft',
};

/** Common -f / -fe nouns that pluralise with -ves. */
const F_VES: ReadonlySet<string> = new Set([
  'leaf', 'life', 'knife', 'wife', 'wolf', 'half', 'shelf', 'calf', 'loaf',
  'thief', 'self', 'sheaf', 'scarf', 'hoof', 'elf',
]);

/** Third-person singular forms that are not produced by `addS`. */
const SPECIAL_THIRD: Readonly<Record<string, string>> = {
  be: 'is',
  have: 'has',
};

/** Present participles that are not produced by `addIng`. */
const SPECIAL_ING: Readonly<Record<string, string>> = {
  be: 'being',
  see: 'seeing',
  flee: 'fleeing',
  agree: 'agreeing',
  die: 'dying',
  lie: 'lying',
  tie: 'tying',
};

const IRREGULAR_PAST = new Map<string, string>();
const IRREGULAR_PARTICIPLE = new Map<string, string>();
for (const [base, past, participle] of IRREGULAR_VERBS) {
  IRREGULAR_PAST.set(base, past);
  IRREGULAR_PARTICIPLE.set(base, participle);
}
IRREGULAR_PAST.set('be', 'was');
IRREGULAR_PARTICIPLE.set('be', 'been');

/**
 * Regular verbs common in academic and mentoring prose. Combined with the
 * irregular bases above this is the "known verb" lexicon the rules are allowed
 * to touch. A verb that is not here is simply left alone.
 */
const REGULAR_VERBS: readonly string[] = [
  'accept', 'achieve', 'address', 'advise', 'allow', 'analyse', 'analyze',
  'answer', 'apply', 'appreciate', 'approach', 'argue', 'arrange', 'arrive',
  'ask', 'assist', 'attend', 'avoid', 'balance', 'behave', 'believe', 'belong',
  'benefit', 'book', 'boost', 'borrow', 'calculate', 'call', 'carry', 'cause',
  'change', 'check', 'clarify', 'clean', 'clear', 'close', 'collect', 'combine',
  'compare', 'complete', 'concentrate', 'conduct', 'confirm', 'connect',
  'consider', 'contact', 'continue', 'contribute', 'control', 'convince',
  'cope', 'correct', 'cover', 'create', 'criticise', 'criticize', 'decide',
  'decrease', 'define', 'delay', 'deliver', 'demand', 'demonstrate', 'depend',
  'describe', 'develop', 'discuss', 'display', 'disturb', 'divide', 'document',
  'doubt', 'drop', 'earn', 'edit', 'educate', 'email', 'encourage', 'enjoy',
  'ensure', 'enter', 'examine', 'expand', 'expect', 'explain', 'explore',
  'express', 'face', 'fail', 'fill', 'finish', 'fit', 'fix', 'focus', 'follow',
  'form', 'gain', 'gather', 'grab', 'grade', 'guide', 'handle', 'happen',
  'help', 'highlight', 'hope', 'identify', 'ignore', 'implement', 'imply',
  'improve', 'include', 'increase', 'inform', 'instruct', 'integrate',
  'introduce', 'invest', 'invite', 'involve', 'join', 'judge', 'lack', 'lead',
  'listen', 'look', 'love', 'maintain', 'manage', 'mark', 'measure', 'mention',
  'miss', 'motivate', 'move', 'need', 'note', 'notice', 'observe', 'obtain',
  'occur', 'offer', 'open', 'organise', 'organize', 'participate', 'perform',
  'permit', 'plan', 'play', 'point', 'practice', 'practise', 'praise',
  'prefer', 'prepare', 'present', 'prevent', 'process', 'produce', 'progress',
  'promote', 'propose', 'protect', 'provide', 'publish', 'punish', 'pursue',
  'push', 'raise', 'reach', 'realise', 'realize', 'receive', 'recognise',
  'recognize', 'recommend', 'record', 'reduce', 'refer', 'reflect', 'refuse',
  'regard', 'register', 'regret', 'relate', 'relax', 'release', 'remain',
  'remember', 'remind', 'remove', 'repair', 'repeat', 'replace', 'reply',
  'report', 'request', 'require', 'research', 'resolve', 'respect', 'respond',
  'result', 'retain', 'return', 'review', 'revise', 'reward', 'save', 'scan',
  'score', 'search', 'seem', 'select', 'separate', 'serve', 'share', 'shift',
  'shop', 'sign', 'simplify', 'skip', 'slow', 'solve', 'start', 'state', 'stay',
  'stop', 'stress', 'study', 'submit', 'succeed', 'suggest', 'supervise',
  'support', 'suppose', 'surprise', 'survive', 'switch', 'talk', 'tend',
  'test', 'thank', 'train', 'transfer', 'travel', 'treat', 'try', 'turn',
  'update', 'upgrade', 'use', 'value', 'vary', 'visit', 'volunteer', 'wait',
  'walk', 'want', 'warn', 'wash', 'watch', 'welcome', 'wish', 'work', 'worry',
];

// ---------------------------------------------------------------------------
// Inflection generators
// ---------------------------------------------------------------------------

export function thirdPerson(base: string): string {
  const special = SPECIAL_THIRD[base];
  if (special) return special;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh|o)$/.test(base)) return `${base}es`;
  return `${base}s`;
}

export function pastTense(base: string): string {
  const irregular = IRREGULAR_PAST.get(base);
  if (irregular) return irregular;
  if (/e$/.test(base)) return `${base}d`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ied`;
  return DOUBLE_FINAL.has(base) ? `${base}${base.slice(-1)}ed` : `${base}ed`;
}

export function pastParticiple(base: string): string {
  const irregular = IRREGULAR_PARTICIPLE.get(base);
  if (irregular) return irregular;
  if (/e$/.test(base)) return `${base}d`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ied`;
  return DOUBLE_FINAL.has(base) ? `${base}${base.slice(-1)}ed` : `${base}ed`;
}

export function presentParticiple(base: string): string {
  const special = SPECIAL_ING[base];
  if (special) return special;
  if (/ie$/.test(base)) return `${base.slice(0, -2)}ying`;
  if (/e$/.test(base) && !/(ee|oe|ye)$/.test(base)) return `${base.slice(0, -1)}ing`;
  return DOUBLE_FINAL.has(base) ? `${base}${base.slice(-1)}ing` : `${base}ing`;
}

export function pluralize(singular: string): string {
  const irregular = IRREGULAR_PLURALS[singular];
  if (irregular) return irregular;
  if (/[^aeiou]y$/.test(singular)) return `${singular.slice(0, -1)}ies`;
  if (F_VES.has(singular)) return `${singular.slice(0, -1)}ves`;
  if (/(s|x|z|ch|sh)$/.test(singular)) return `${singular}es`;
  return `${singular}s`;
}

// ---------------------------------------------------------------------------
// Verb lexicon + reverse form lookup
// ---------------------------------------------------------------------------

const VERB_LEMMAS: ReadonlySet<string> = new Set<string>([
  ...IRREGULAR_VERBS.map(([base]) => base),
  ...REGULAR_VERBS,
]);

/**
 * form -> base, published only for forms that map to exactly one base verb and
 * are not themselves a base verb of another word. Ambiguous forms are omitted.
 */
const FORM_TO_BASE: ReadonlyMap<string, string> = (() => {
  const counts = new Map<string, number>();
  const map = new Map<string, string>();
  const seenPairs = new Set<string>();

  const add = (form: string, base: string) => {
    if (!form || form === base) return;
    // A regular verb's past and participle are identical: that is one form, not
    // an ambiguity, so identical (form, base) pairs are only counted once.
    const pair = `${form}\u0000${base}`;
    if (seenPairs.has(pair)) return;
    seenPairs.add(pair);
    counts.set(form, (counts.get(form) ?? 0) + 1);
    map.set(form, base);
  };

  for (const base of VERB_LEMMAS) {
    add(thirdPerson(base), base);
    add(pastTense(base), base);
    add(pastParticiple(base), base);
    add(presentParticiple(base), base);
  }
  for (const [form, base] of IRREGULAR_ALIASES) add(form, base);

  const result = new Map<string, string>();
  for (const [form, base] of map) {
    // Drop ambiguous forms, and forms that are themselves a base verb elsewhere.
    if ((counts.get(form) ?? 0) > 1) continue;
    if (VERB_LEMMAS.has(form)) continue;
    result.set(form, base);
  }
  return result;
})();

/** Base verbs whose simple past is identical to the base ("read", "put", ...). */
const BASE_EQUALS_PAST: ReadonlySet<string> = new Set<string>(
  [...VERB_LEMMAS].filter((base) => pastTense(base) === base)
);

/**
 * Simple-past forms ("went", "submitted", "ate"). Used by the missing-auxiliary
 * rule, which may only insert "did" before a *past* form ("he not went" ->
 * "he did not go"). Present participles and third-person forms are deliberately
 * excluded so the rule can never change the tense of a clause.
 */
const PAST_FORMS: ReadonlySet<string> = new Set<string>(
  [...VERB_LEMMAS].map((base) => pastTense(base))
);

export { VERB_LEMMAS, FORM_TO_BASE, BASE_EQUALS_PAST, PAST_FORMS };

/** Return the single base verb a form belongs to, or undefined when unknown. */
export function baseVerbOf(form: string): string | undefined {
  return FORM_TO_BASE.get(form);
}

/** True when `form` is the simple past tense of a known verb. */
export function isPastForm(form: string): boolean {
  return PAST_FORMS.has(form);
}

export function isVerbLemma(word: string): boolean {
  return VERB_LEMMAS.has(word);
}
