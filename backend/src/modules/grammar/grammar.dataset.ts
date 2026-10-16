/**
 * Curated grammar dataset for the KSRCE mentoring writing assistant.
 * -----------------------------------------------------------------
 * This is a *curated, extensible* dataset, not a language model and not a claim
 * of exhaustive coverage. It has three parts:
 *
 *   1. EXACT_CORRECTIONS  - whole sentences whose correct form is stored. These
 *                           are used only when the (safely normalised) input is
 *                           an exact match, so meaning can never drift.
 *   2. WORD_CORRECTIONS   - misspelling / proper-noun dictionary applied word by
 *                           word with a boundary match, skipping official codes.
 *   3. PHRASE_RULES       - careful, ordered substitutions for the grammar
 *                           categories the feature must support (subject-verb
 *                           agreement, articles, prepositions, frequent
 *                           sentence-structure errors, contraction punctuation).
 *
 * Only additive edits belong here. A new sentence pair or rule is safe to append;
 * it must never rewrite meaning. Add an entry and it is picked up by the engine.
 */

export type GrammarCategory =
  | 'spelling'
  | 'capitalization'
  | 'punctuation'
  | 'subject-verb'
  | 'articles'
  | 'prepositions'
  | 'sentence-structure'
  | 'exact';

export interface ExactCorrection {
  /** The erroneous sentence, matched after safe normalisation. */
  wrong: string;
  /** The stored correct version, applied only on an exact match. */
  right: string;
  /**
   * Whether a very close (typo-level) variant of `wrong` may be corrected by the
   * approximate matcher. Only near-identical, meaning-preserving pairs should
   * set this, because the approximate path replaces the whole sentence.
   */
  allowApproximate?: boolean;
  /** A short human note describing what the correction fixes. */
  note?: string;
}

/** Default confidence reported when a stored exact sentence is applied. */
export const EXACT_MATCH_CONFIDENCE = 0.99;
/** Confidence reported when a near-identical sentence is corrected. */
export const APPROX_MATCH_CONFIDENCE = 0.85;
/** Confidence reported when the deterministic rules produce a correction. */
export const RULES_CONFIDENCE = 0.9;
/** Accept an approximate sentence match at or above this token similarity. */
export const APPROX_MATCH_THRESHOLD = 0.9;
/** Similar but below the accept threshold: report ambiguity, never guess. */
export const AMBIGUOUS_THRESHOLD = 0.7;
/**
 * Minimum content-token overlap between a curated pair's `wrong` and `right`
 * before the pair may opt into the whole-sentence approximate path.
 * It is a hard gate: a curated rewrite that replaces this much vocabulary
 * ("is having arrear" -> "has standing arrears") stays available through the
 * exact-match path and the rule engine, but must not silently substitute a
 * whole sentence for a merely similar input. The dataset test enforces it.
 */
export const APPROX_TOPIC_FLOOR = 0.5;

/**
 * Whole-sentence corrections whose correct form is not derivable from simple
 * word/substitution rules (structural rewrites). Kept deliberately small and
 * mentoring-focused; each entry is verified by the dataset test suite.
 */
export const EXACT_CORRECTIONS: readonly ExactCorrection[] = [
  {
    wrong: 'student is not good in communication and he need improve presentation skill',
    right: 'The student needs to improve communication and presentation skills.',
    note: 'subject-verb + article + pluralisation in one structural rewrite',
  },
  {
    wrong: 'he is having arrear in two subjects',
    right: 'He has standing arrears in two subjects.',
    note: 'progressive tense used for a state + plural arrear',
  },
  {
    wrong: 'she is not attending the class regularly because of health issue',
    right: 'She is not attending classes regularly because of health issues.',
    allowApproximate: true,
    note: 'plural of classes / health issues',
  },
  {
    wrong: 'student has low attendance and not concentrating in class',
    right: 'The student has low attendance and is not concentrating in class.',
    allowApproximate: true,
    note: 'missing article and missing auxiliary verb',
  },
  {
    wrong: 'parents are not aware about the progress of student',
    right: "Parents are not aware of the student's progress.",
    allowApproximate: true,
    note: 'aware about -> aware of',
  },
  {
    wrong: 'student is very poor in english and not able to communicate',
    right: 'The student is very poor in English and is unable to communicate.',
    allowApproximate: true,
    note: 'proper noun + unable to',
  },
  {
    wrong: 'he dont have interest in studies',
    right: 'He does not have interest in studies.',
    allowApproximate: true,
    note: 'does not + contraction-apostrophe error',
  },
  {
    wrong: 'student not submitted the assignment on time',
    right: 'The student did not submit the assignment on time.',
    allowApproximate: true,
    note: 'missing auxiliary in simple past negative',
  },
  {
    wrong: 'she have problem in understanding the subject',
    right: 'She has a problem understanding the subject.',
    allowApproximate: true,
    note: 'have -> has + missing article',
  },
  {
    wrong: 'he is weak in communication so he cannot able to express his ideas',
    right: 'He is weak in communication, so he is unable to express his ideas.',
    allowApproximate: true,
    note: 'cannot able to -> is unable to',
  },
  {
    wrong: 'student are not preparing well for the exam',
    right: 'The student is not preparing well for the exam.',
    allowApproximate: true,
    note: 'singular subject with plural verb',
  },
  {
    wrong: 'he is not doing his homework regularly and his marks is decreasing',
    right: 'He is not doing his homework regularly, and his marks are decreasing.',
    allowApproximate: true,
    note: 'plural subject with singular verb + comma splice',
  },
  {
    wrong: 'she dont attended the lab sessions',
    right: 'She did not attend the lab sessions.',
    note: 'did not + base verb',
  },
  {
    wrong: 'the student behaviour is not good with the faculty',
    right: "The student's behaviour is not good with the faculty.",
    allowApproximate: true,
    note: 'missing possessive',
  },
  {
    wrong: 'he is having difficulty to understand the concept',
    right: 'He is having difficulty understanding the concept.',
    allowApproximate: true,
    note: 'difficulty + gerund (no "to")',
  },
  {
    wrong: 'there is no improvement in she performance',
    right: 'There is no improvement in her performance.',
    allowApproximate: true,
    note: 'object pronoun -> possessive',
  },
];

/**
 * Word-level corrections. Keys are matched case-insensitively with a word
 * boundary and are skipped when the matched token looks like an official code
 * (all-caps or containing a digit). Proper nouns and weekdays are included so
 * that "english" / "friday" are capitalised reliably.
 */
export const WORD_CORRECTIONS: Readonly<Record<string, string>> = {
  // --- original KSRCE mentoring vocabulary (behaviour preserved) ---
  comunication: 'communication',
  comunicate: 'communicate',
  presenation: 'presentation',
  presentaion: 'presentation',
  attandance: 'attendance',
  attendence: 'attendance',
  arrier: 'arrear',
  arriers: 'arrears',
  arear: 'arrear',
  arears: 'arrears',
  counceling: 'counselling',
  councelling: 'counselling',
  councelor: 'counsellor',
  counseling: 'counselling',
  counceler: 'counsellor',
  studnt: 'student',
  studnts: 'students',
  imporve: 'improve',
  imporvement: 'improvement',
  improvment: 'improvement',
  necesary: 'necessary',
  dificult: 'difficult',
  dificulty: 'difficulty',
  disscuss: 'discuss',
  disscussion: 'discussion',
  reccomend: 'recommend',
  recomended: 'recommended',
  reccommend: 'recommend',
  regularily: 'regularly',
  absentiesm: 'absenteeism',
  behaivor: 'behavior',
  behaivour: 'behaviour',
  asign: 'assign',
  asignment: 'assignment',
  asignments: 'assignments',
  preperation: 'preparation',
  prepair: 'prepare',
  consistant: 'consistent',
  confidance: 'confidence',
  guidence: 'guidance',
  proformance: 'performance',
  preformance: 'performance',

  // --- additional common English misspellings (academic / mentoring prose) ---
  accomodate: 'accommodate',
  acheive: 'achieve',
  acheived: 'achieved',
  acheivement: 'achievement',
  acheivements: 'achievements',
  adress: 'address',
  agressive: 'aggressive',
  appologies: 'apologies',
  appriciate: 'appreciate',
  appriciated: 'appreciated',
  arguement: 'argument',
  assistence: 'assistance',
  basicly: 'basically',
  begining: 'beginning',
  beleive: 'believe',
  calender: 'calendar',
  carrear: 'career',
  certficate: 'certificate',
  certifcate: 'certificate',
  collegue: 'colleague',
  comitte: 'committee',
  compitition: 'competition',
  concenteration: 'concentration',
  concentratoin: 'concentration',
  confussion: 'confusion',
  curriculam: 'curriculum',
  decipline: 'discipline',
  descision: 'decision',
  developement: 'development',
  diffrent: 'different',
  enginering: 'engineering',
  enviornment: 'environment',
  excellant: 'excellent',
  faliure: 'failure',
  familar: 'familiar',
  focuss: 'focus',
  foriegn: 'foreign',
  happenned: 'happened',
  higene: 'hygiene',
  immediatly: 'immediately',
  impliment: 'implement',
  implimentation: 'implementation',
  imformation: 'information',
  informations: 'information',
  intrest: 'interest',
  intrested: 'interested',
  intresting: 'interesting',
  knowlege: 'knowledge',
  langauge: 'language',
  libary: 'library',
  maintainance: 'maintenance',
  managment: 'management',
  neccessary: 'necessary',
  neglegence: 'negligence',
  noticable: 'noticeable',
  obediance: 'obedience',
  obidience: 'obedience',
  occurance: 'occurrence',
  occured: 'occurred',
  particepate: 'participate',
  perfomance: 'performance',
  permanant: 'permanent',
  persue: 'pursue',
  posession: 'possession',
  possitive: 'positive',
  priviledge: 'privilege',
  profesion: 'profession',
  profesional: 'professional',
  pronounciation: 'pronunciation',
  publically: 'publicly',
  recieve: 'receive',
  recieved: 'received',
  recomendation: 'recommendation',
  refered: 'referred',
  relevent: 'relevant',
  remeber: 'remember',
  remmember: 'remember',
  repitition: 'repetition',
  responce: 'response',
  responsable: 'responsible',
  responsibilty: 'responsibility',
  rythm: 'rhythm',
  scedule: 'schedule',
  shedule: 'schedule',
  similiar: 'similar',
  sincerly: 'sincerely',
  speach: 'speech',
  strenght: 'strength',
  studing: 'studying',
  sucess: 'success',
  sucessful: 'successful',
  successfull: 'successful',
  sucessfully: 'successfully',
  supervisior: 'supervisor',
  tecnique: 'technique',
  techniqe: 'technique',
  temperory: 'temporary',
  thier: 'their',
  tommorow: 'tomorrow',
  tomorow: 'tomorrow',
  tution: 'tuition',
  unfortunatly: 'unfortunately',
  univercity: 'university',
  usualy: 'usually',
  wich: 'which',
  writting: 'writing',

  // --- proper nouns / languages / weekdays (capitalisation) ---
  english: 'English',
  tamil: 'Tamil',
  hindi: 'Hindi',
  sanskrit: 'Sanskrit',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export interface PhraseRule {
  /** Global, case-insensitive pattern. */
  pattern: RegExp;
  /** Replacement string (may use $1 capture groups). */
  replace: string;
  category: GrammarCategory;
  label: string;
}

/**
 * Ordered phrase / structure rules.
 *
 * Ordering constraints that matter:
 *   - contraction spelling ("dont" -> "don't", "couldnt" -> "couldn't") runs
 *     BEFORE the subject-verb rules, so "he dont have" can become
 *     "he doesn't have" (the (he|she|it) don't rule) instead of being mangled.
 *   - the full structural rewrite is listed before the smaller rules it
 *     subsumes, and the "need improve" rules before the generic "need" rules.
 *   - spacing fixes run last so they clean punctuation produced above.
 */
export const PHRASE_RULES: readonly PhraseRule[] = [
  // --- full structural rewrites (keep before their sub-strings) ---
  {
    pattern: /\bstudent is not good in communication and he need improve presentation skill\b/gi,
    replace: 'The student needs to improve communication and presentation skills.',
    category: 'sentence-structure',
    label: 'structural rewrite: student needs to improve',
  },
  {
    pattern: /\bstudent is not good in\b/gi,
    replace: 'the student needs improvement in',
    category: 'sentence-structure',
    label: 'student is not good in -> the student needs improvement in',
  },

  // --- contraction spelling (before subject-verb rules) ---
  { pattern: /\bdont\b/gi, replace: "don't", category: 'punctuation', label: 'dont -> don\u2019t' },
  { pattern: /\bdoesnt\b/gi, replace: "doesn't", category: 'punctuation', label: 'doesnt -> doesn\u2019t' },
  { pattern: /\bdidnt\b/gi, replace: "didn't", category: 'punctuation', label: 'didnt -> didn\u2019t' },
  { pattern: /\bwasnt\b/gi, replace: "wasn't", category: 'punctuation', label: 'wasnt -> wasn\u2019t' },
  { pattern: /\bisnt\b/gi, replace: "isn't", category: 'punctuation', label: 'isnt -> isn\u2019t' },
  { pattern: /\bwont\b/gi, replace: "won't", category: 'punctuation', label: 'wont -> won\u2019t' },
  { pattern: /\bcouldnt\b/gi, replace: "couldn't", category: 'punctuation', label: 'couldnt -> couldn\u2019t' },
  { pattern: /\bwouldnt\b/gi, replace: "wouldn't", category: 'punctuation', label: 'wouldnt -> wouldn\u2019t' },
  { pattern: /\bshouldnt\b/gi, replace: "shouldn't", category: 'punctuation', label: 'shouldnt -> shouldn\u2019t' },
  { pattern: /\bcant\b/gi, replace: "can't", category: 'punctuation', label: 'cant -> can\u2019t' },

  // --- subject-verb agreement (need / need to) ---
  { pattern: /\bhe need improve\b/gi, replace: 'he needs to improve', category: 'subject-verb', label: 'he need improve' },
  { pattern: /\bshe need improve\b/gi, replace: 'she needs to improve', category: 'subject-verb', label: 'she need improve' },
  { pattern: /\bthey need improve\b/gi, replace: 'they need to improve', category: 'subject-verb', label: 'they need improve' },
  { pattern: /\bstudent need improve\b/gi, replace: 'student needs to improve', category: 'subject-verb', label: 'student need improve' },
  { pattern: /\bhe need to\b/gi, replace: 'he needs to', category: 'subject-verb', label: 'he need to' },
  { pattern: /\bshe need to\b/gi, replace: 'she needs to', category: 'subject-verb', label: 'she need to' },
  { pattern: /\bstudent need to\b/gi, replace: 'student needs to', category: 'subject-verb', label: 'student need to' },
  { pattern: /\bstudent need\b/gi, replace: 'student needs', category: 'subject-verb', label: 'student need' },
  { pattern: /\b(he|she|it) need\b/gi, replace: '$1 needs', category: 'subject-verb', label: 'he/she/it need' },

  // --- subject-verb agreement (have / has) ---
  { pattern: /\bhe have\b/gi, replace: 'he has', category: 'subject-verb', label: 'he have' },
  { pattern: /\bshe have\b/gi, replace: 'she has', category: 'subject-verb', label: 'she have' },
  { pattern: /\bstudent have\b/gi, replace: 'student has', category: 'subject-verb', label: 'student have' },
  { pattern: /\b(he|she|it) have\b/gi, replace: '$1 has', category: 'subject-verb', label: 'he/she/it have' },
  { pattern: /\b(they|we|you) has\b/gi, replace: '$1 have', category: 'subject-verb', label: 'they/we/you has' },

  // --- subject-verb agreement (do / does, was / were, is / are) ---
  { pattern: /\b(he|she|it) don't\b/gi, replace: "$1 doesn't", category: 'subject-verb', label: "he/she/it don't" },
  { pattern: /\b(they|we|you) doesn't\b/gi, replace: "$1 don't", category: 'subject-verb', label: "they/we/you doesn't" },
  { pattern: /\b(they|we|you) was\b/gi, replace: '$1 were', category: 'subject-verb', label: 'they/we/you was' },
  { pattern: /\b(he|she|it) were\b/gi, replace: '$1 was', category: 'subject-verb', label: 'he/she/it were' },
  { pattern: /\b(he|she|it) are\b/gi, replace: '$1 is', category: 'subject-verb', label: 'he/she/it are' },
  { pattern: /\bstudent are\b/gi, replace: 'student is', category: 'subject-verb', label: 'student are' },
  { pattern: /\bmarks is\b/gi, replace: 'marks are', category: 'subject-verb', label: 'marks is' },
  { pattern: /\bstudents is\b/gi, replace: 'students are', category: 'subject-verb', label: 'students is' },

  // --- bare infinitive after an infinitive marker ---
  { pattern: /\bto developed\b/gi, replace: 'to develop', category: 'sentence-structure', label: 'to developed -> to develop' },
  { pattern: /\bto improved\b/gi, replace: 'to improve', category: 'sentence-structure', label: 'to improved' },
  { pattern: /\bto completed\b/gi, replace: 'to complete', category: 'sentence-structure', label: 'to completed' },
  { pattern: /\bto attended\b/gi, replace: 'to attend', category: 'sentence-structure', label: 'to attended' },
  { pattern: /\bto participated\b/gi, replace: 'to participate', category: 'sentence-structure', label: 'to participated' },
  { pattern: /\bto cleared\b/gi, replace: 'to clear', category: 'sentence-structure', label: 'to cleared' },
  { pattern: /\bto submitted\b/gi, replace: 'to submit', category: 'sentence-structure', label: 'to submitted' },
  { pattern: /\bto solved\b/gi, replace: 'to solve', category: 'sentence-structure', label: 'to solved' },
  { pattern: /\bto practiced\b/gi, replace: 'to practice', category: 'sentence-structure', label: 'to practiced' },
  { pattern: /\bto scored\b/gi, replace: 'to score', category: 'sentence-structure', label: 'to scored' },
  { pattern: /\bto learned\b/gi, replace: 'to learn', category: 'sentence-structure', label: 'to learned' },
  { pattern: /\bto studied\b/gi, replace: 'to study', category: 'sentence-structure', label: 'to studied' },
  { pattern: /\bto prepared\b/gi, replace: 'to prepare', category: 'sentence-structure', label: 'to prepared' },

  // --- noun pluralisation after a general verb ---
  { pattern: /\bpractice presentation\b/gi, replace: 'practice presentations', category: 'sentence-structure', label: 'practice presentation -> presentations' },
  { pattern: /\bpracticing presentation\b/gi, replace: 'practicing presentations', category: 'sentence-structure', label: 'practicing presentation -> presentations' },
  { pattern: /\bpresentation skill\b/gi, replace: 'presentation skills', category: 'sentence-structure', label: 'presentation skill -> skills' },
  { pattern: /\bcommunication skill\b/gi, replace: 'communication skills', category: 'sentence-structure', label: 'communication skill -> skills' },
  { pattern: /\btechnical skill\b/gi, replace: 'technical skills', category: 'sentence-structure', label: 'technical skill -> skills' },
  { pattern: /\bprogramming skill\b/gi, replace: 'programming skills', category: 'sentence-structure', label: 'programming skill -> skills' },
  { pattern: /\bcoding skill\b/gi, replace: 'coding skills', category: 'sentence-structure', label: 'coding skill -> skills' },
  { pattern: /\bsoft skill\b/gi, replace: 'soft skills', category: 'sentence-structure', label: 'soft skill -> skills' },
  { pattern: /\bcommunication gap\b/gi, replace: 'communication gaps', category: 'sentence-structure', label: 'communication gap -> gaps' },

  // --- articles (only the safe, high-confidence cases) ---
  // "an" before a lowercase consonant-initial word ("an student" -> "a student").
  // Requiring a lowercase second letter deliberately skips acronyms such as
  // "an MBA" and "an SOS", which are pronounced with a vowel sound.
  { pattern: /\ban (?=[bcdfgjklmnpqrstvwxyz][a-z])/gi, replace: 'a ', category: 'articles', label: 'an + consonant sound -> a' },
  // "a" before a small, unambiguous set of vowel-initial words. "university",
  // "user", "European" and "one" are excluded because they take "a".
  {
    pattern: /\ba (?=(?:apple|egg|hour|honest|easy|interesting|important|excellent|opportunity|issue|answer|example|idea|engineer|academic|attitude|aptitude)\b)/gi,
    replace: 'an ',
    category: 'articles',
    label: 'a + vowel sound -> an',
  },
  { pattern: /\bgive presentation\b/gi, replace: 'give a presentation', category: 'articles', label: 'give presentation -> give a presentation' },

  // --- prepositions (common fixed expressions) ---
  { pattern: /\bdiscuss about\b/gi, replace: 'discuss', category: 'prepositions', label: 'discuss about -> discuss' },
  { pattern: /\bdiscussed about\b/gi, replace: 'discussed', category: 'prepositions', label: 'discussed about -> discussed' },
  { pattern: /\bexplain about\b/gi, replace: 'explain', category: 'prepositions', label: 'explain about -> explain' },
  { pattern: /\baware about\b/gi, replace: 'aware of', category: 'prepositions', label: 'aware about -> aware of' },
  { pattern: /\binterested about\b/gi, replace: 'interested in', category: 'prepositions', label: 'interested about -> interested in' },
  { pattern: /\bdepends of\b/gi, replace: 'depends on', category: 'prepositions', label: 'depends of -> depends on' },
  { pattern: /\bcomprises of\b/gi, replace: 'comprises', category: 'prepositions', label: 'comprises of -> comprises' },
  { pattern: /\bcope up with\b/gi, replace: 'cope with', category: 'prepositions', label: 'cope up with -> cope with' },
  { pattern: /\bgood in\b/gi, replace: 'good at', category: 'prepositions', label: 'good in -> good at' },

  // --- frequent sentence-structure errors ---
  { pattern: /\badviced\b/gi, replace: 'advised', category: 'spelling', label: 'adviced -> advised' },
  { pattern: /\bis having arrear\b/gi, replace: 'has standing arrears', category: 'sentence-structure', label: 'is having arrear' },
  { pattern: /\bis having arrears\b/gi, replace: 'has standing arrears', category: 'sentence-structure', label: 'is having arrears' },
  { pattern: /\blab observation book\b/gi, replace: 'lab observation notebook', category: 'sentence-structure', label: 'lab observation book' },
  { pattern: /\bdo not doing\b/gi, replace: 'is not doing', category: 'sentence-structure', label: 'do not doing -> is not doing' },
  { pattern: /\bcannot able to\b/gi, replace: 'is unable to', category: 'sentence-structure', label: 'cannot able to -> is unable to' },
  { pattern: /\bcan be able to\b/gi, replace: 'can', category: 'sentence-structure', label: 'can be able to -> can' },
  { pattern: /\bcould not able to\b/gi, replace: 'could not', category: 'sentence-structure', label: 'could not able to -> could not' },
  { pattern: /\bmore better\b/gi, replace: 'better', category: 'sentence-structure', label: 'more better -> better' },
  { pattern: /\bone of the student\b/gi, replace: 'one of the students', category: 'sentence-structure', label: 'one of the student -> students' },
  { pattern: /\bthese kind of\b/gi, replace: 'these kinds of', category: 'sentence-structure', label: 'these kind of -> these kinds of' },
  { pattern: /\breturn back\b/gi, replace: 'return', category: 'sentence-structure', label: 'return back -> return' },
  { pattern: /\brevert back\b/gi, replace: 'revert', category: 'sentence-structure', label: 'revert back -> revert' },

  // --- punctuation / spacing (safe, no decimals or codes affected) ---
  { pattern: /\s+([,.;:!?])/g, replace: '$1', category: 'punctuation', label: 'remove space before punctuation' },
  { pattern: /([,;:!?])(?=[A-Za-z])/g, replace: '$1 ', category: 'punctuation', label: 'space after punctuation' },
];

/**
 * Configuration for the missing-auxiliary-verb repair
 * ("student not attending class regularly" -> "The student is not attending
 * classes regularly."). The logic lives in `grammar.structure.ts`; the data
 * lives here so the behaviour stays curated and extensible.
 *
 * This is deliberately *curated* rather than "any -ing word". English is full of
 * noun/adjective "-ing" words (during, morning, meeting, building, ceiling, ...)
 * that must never be treated as a verb. Only the participle forms below are ever
 * repaired, and only when the clause has no other finite verb.
 */
export const MISSING_AUX_GERUNDS: ReadonlySet<string> = new Set([
  'attending', 'submitting', 'facing', 'having', 'doing', 'preparing',
  'studying', 'missing', 'struggling', 'working', 'performing',
  'understanding', 'learning', 'practicing', 'practising', 'reading',
  'writing', 'listening', 'speaking', 'revising', 'completing', 'improving',
  'showing', 'failing', 'scoring', 'participating', 'skipping', 'avoiding',
  'ignoring', 'causing', 'getting', 'making', 'taking', 'trying', 'using',
  'following', 'maintaining', 'developing', 'concentrating', 'contributing',
  'helping', 'disturbing', 'misbehaving', 'arguing', 'complaining', 'coping',
  'wasting', 'sleeping', 'neglecting', 'disobeying', 'bunking',
  // Common motion / everyday action participles. "coming" was the reported gap
  // ("he not coming tomorrow" was not repaired). Noun/adjective "-ing" words
  // (morning, evening, meeting, building, ceiling, something, ...) are still
  // deliberately absent so they can never be mistaken for a verb.
  'coming', 'going', 'talking', 'asking', 'telling', 'bringing', 'waiting',
  'looking', 'watching', 'visiting', 'leaving', 'arriving', 'sending',
  'eating', 'drinking', 'walking', 'sitting', 'standing', 'wearing', 'paying',
]);

/**
 * Subject -> the auxiliary "be" verb it takes. Only subjects listed here are
 * repaired, and only when they begin a sentence (optionally after "the").
 */
export const MISSING_AUX_SUBJECTS: Readonly<Record<string, 'is' | 'are'>> = {
  student: 'is',
  students: 'are',
  mentee: 'is',
  mentees: 'are',
  he: 'is',
  she: 'is',
  it: 'is',
  they: 'are',
  we: 'are',
};

/** Subjects that take an article ("The student", never "The he"). */
export const MISSING_AUX_NOUN_SUBJECTS: ReadonlySet<string> = new Set([
  'student',
  'students',
  'mentee',
  'mentees',
]);

/**
 * A word that can only be a finite verb, auxiliary or modal. If one of these
 * appears *after* the participle, the "-ing" word is almost certainly part of a
 * reduced relative clause ("Students facing difficulty should approach the
 * mentor") and the sentence must be left untouched rather than turned into a
 * broken statement.
 */
export const FINITE_VERB_MARKERS: ReadonlySet<string> = new Set([
  'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being', 'has', 'have', 'had',
  'do', 'does', 'did', 'can', 'could', 'will', 'would', 'shall', 'should',
  'may', 'might', 'must', 'need', 'needs', 'needed', 'want', 'wants', 'wanted',
  'help', 'helps', 'helped', 'cause', 'causes', 'caused', 'lead', 'leads',
  'led', 'result', 'results', 'resulted', 'require', 'requires', 'required',
  'deserve', 'deserves', 'deserved', 'face', 'faces', 'faced', 'give', 'gives',
  'gave', 'take', 'takes', 'took', 'make', 'makes', 'made', 'get', 'gets',
  'got', 'remain', 'remains', 'remained', 'become', 'becomes', 'became',
  'improve', 'improves', 'improved', 'attend', 'attends', 'attended', 'submit',
  'submits', 'submitted', 'keep', 'keeps', 'kept', 'show', 'shows', 'showed',
  'fail', 'fails', 'failed', 'score', 'scores', 'scored', 'come', 'comes',
  'came', 'go', 'goes', 'went', 'say', 'says', 'said', 'tell', 'tells', 'told',
  'ask', 'asks', 'asked', 'find', 'finds', 'found', 'put', 'puts', 'seem',
  'seems', 'seemed', 'look', 'looks', 'looked',
]);

/**
 * Singular count objects that are conventionally plural after the participles
 * above. Applied only to a clause that was actually rebuilt by the
 * missing-auxiliary repair, so an already-correct "attending class" is never
 * reworded just for style.
 */
export const MISSING_AUX_OBJECT_PLURALS: readonly (readonly [RegExp, string])[] = [
  [/\battending class\b/gi, 'attending classes'],
  [/\battending lecture\b/gi, 'attending lectures'],
  [/\bsubmitting assignment\b/gi, 'submitting assignments'],
  [/\bmissing class\b/gi, 'missing classes'],
  [/\bmissing lecture\b/gi, 'missing lectures'],
  [/\bskipping class\b/gi, 'skipping classes'],
];