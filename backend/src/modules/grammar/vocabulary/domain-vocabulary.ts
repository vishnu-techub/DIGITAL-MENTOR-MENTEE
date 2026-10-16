/**
 * Curated linguistic data for the grammar rules.
 * ----------------------------------------------
 * These are *closed sets chosen for safety*, not attempts at exhaustive English
 * coverage. A rule only ever fires when a word is in the relevant set, so the
 * worst case for an unseen construction is that it is left untouched.
 *
 * Nothing here is derived from any copyrighted list; the word lists are common
 * nouns/verbs and academic vocabulary written for this project.
 */

import { isVerbLemma, pluralize } from './morphology.js';

/**
 * Domain vocabulary that must never be "corrected" by the dictionary-backed
 * spell checker. Modern coinages ("mentee"), institution acronyms and subject
 * abbreviations are either absent from a general dictionary or easy to
 * mis-suggest, so they are whitelisted explicitly.
 */
export const DOMAIN_WORDS: ReadonlySet<string> = new Set([
  'mentee', 'mentees', 'mentor', 'mentors', 'mentoring', 'mentored',
  'mentorship', 'mentee\'s', 'arrear', 'arrears', 'cgpa', 'sgpa', 'cia',
  // "inspite" is a fixed misspelling that an ordered phrase rule repairs to
  // "in spite of". It must not be dictionary-corrected to "inspire" first.
  'inspite',
  'nptel', 'coursera', 'hackerrank', 'leetcode', 'infosys', 'springboard',
  'ksrce', 'ksr', 'itt', 'cse', 'ece', 'eee', 'mech', 'civil', 'it', 'ai',
  'ds', 'vlsi', 'iot', 'nss', 'ncc', 'hod', 'fdp', 'ugc', 'aicte', 'naac',
  'nba', 'anna', 'autonomous', 'semester', 'semesters', 'syllabus', 'syllabi',
  'viva', 'vivavoce', 'internship', 'internships', 'webinar', 'workshop',
  'workshops', 'symposium', 'hackathon', 'hackathons', 'aptitude', 'resume',
  'curricular', 'cocurricular', 'extracurricular', 'counselling', 'counsellor',
  'counselling', 'rubric', 'rubrics', 'portal', 'login', 'whatsapp',
]);

/**
 * Singular count nouns that are conventionally plural after a plural
 * determiner / quantifier ("many student" -> "many students"). Uncountable
 * nouns (research, information, water) are deliberately absent.
 */
export const COUNT_NOUNS: ReadonlySet<string> = new Set([
  'student', 'mentee', 'teacher', 'mentor', 'class', 'lecture', 'assignment',
  'book', 'skill', 'problem', 'issue', 'doubt', 'subject', 'mark', 'exam',
  'project', 'topic', 'question', 'seminar', 'presentation', 'workshop',
  'activity', 'session', 'test', 'paper', 'mistake', 'concept', 'chapter',
  'module', 'task', 'report', 'file', 'form', 'certificate', 'friend',
  'parent', 'relative', 'example', 'idea', 'reason', 'point', 'goal', 'target',
  'habit', 'effort', 'topic', 'lesson', 'course', 'grade', 'level', 'area',
  'candidate', 'applicant', 'member',
]);

/** Determiners / quantifiers that require a plural count noun. */
export const PLURAL_DETERMINERS: ReadonlySet<string> = new Set([
  'many', 'several', 'few', 'both', 'these', 'those', 'various', 'numerous',
  'multiple', 'all', 'some', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten',
]);

/** Singular noun subjects, either a pronoun or a curated noun. */
export const SINGULAR_SUBJECTS: ReadonlySet<string> = new Set([
  'he', 'she', 'it', 'student', 'mentee', 'boy', 'girl', 'child', 'teacher',
  'mentor', 'candidate', 'applicant', 'parent', 'person', 'everyone',
  'everybody', 'someone', 'somebody', 'nobody', 'each',
]);

/** Plural noun subjects. "people" is the plural of "person". */
export const PLURAL_SUBJECTS: ReadonlySet<string> = new Set([
  'they', 'we', 'you', 'students', 'mentees', 'boys', 'girls', 'children',
  'teachers', 'mentors', 'candidates', 'applicants', 'parents', 'people',
]);

/** Adjective form of a subject set, used to rebuild "The student" style output. */
export const SUBJECT_ARTICLES: ReadonlySet<string> = new Set([
  'student', 'mentee', 'boy', 'girl', 'child', 'teacher', 'mentor',
  'candidate', 'applicant', 'parent', 'person',
]);

/**
 * Verbs safe to conjugate in the pronoun subject-verb-agreement rule. Kept
 * deliberately to action / clear-stative verbs so "it clear" (a missing copula)
 * is never turned into "it clears".
 */
export const AGREEMENT_VERBS: ReadonlySet<string> = new Set([
  'want', 'need', 'like', 'love', 'hate', 'know', 'think', 'feel', 'believe',
  'understand', 'go', 'come', 'study', 'work', 'learn', 'read', 'write',
  'speak', 'listen', 'attend', 'submit', 'prepare', 'practice', 'practise',
  'play', 'run', 'walk', 'talk', 'watch', 'help', 'try', 'use', 'take', 'make',
  'give', 'do', 'get', 'have', 'seem', 'look', 'appear', 'belong', 'prefer',
  'remember', 'forget', 'miss', 'enjoy', 'avoid', 'improve', 'complete',
  'score', 'perform', 'participate', 'maintain', 'develop', 'concentrate',
  'contribute', 'follow', 'show', 'face', 'fail', 'struggle', 'wish', 'hope',
  'expect', 'plan', 'decide', 'choose', 'start', 'stop', 'continue', 'keep',
  'reach', 'return', 'reply', 'respond', 'agree', 'complain', 'argue',
  'behave', 'disturb', 'neglect', 'skip', 'revise', 'achieve', 'receive',
  'depend', 'send', 'bring', 'buy', 'catch', 'choose', 'drive', 'find', 'hear',
  'hold', 'lose', 'meet', 'pay', 'ride', 'sing', 'spend', 'tell', 'throw',
  'wear', 'win', 'break', 'forget', 'grow', 'hide', 'fly', 'fall', 'fight',
  'eat', 'drink', 'sleep', 'guide', 'explain', 'teach', 'solve', 'analyse',
  'analyze', 'discuss', 'practice', 'practise',
]);

/**
 * Action verbs that can safely become a present participle after be
 * ("he is go" -> "he is going"). Stative / adjective-capable verbs are excluded
 * on purpose ("is clear", "is open" are adjectives, not progressive verbs).
 */
export const PROGRESSIVE_VERBS: ReadonlySet<string> = new Set([
  'go', 'come', 'study', 'work', 'learn', 'read', 'write', 'speak', 'listen',
  'attend', 'submit', 'prepare', 'practice', 'practise', 'play', 'run', 'walk',
  'talk', 'watch', 'help', 'try', 'take', 'make', 'give', 'do', 'get', 'sit',
  'stand', 'wait', 'look', 'eat', 'drink', 'sleep', 'revise', 'complete',
  'perform', 'participate', 'concentrate', 'develop', 'improve', 'maintain',
  'follow', 'score', 'face', 'struggle', 'complain', 'argue', 'disturb',
  'neglect', 'contribute', 'plan', 'start', 'continue', 'behave', 'skip',
]);

/**
 * Letter + following-sound exceptions for the a/an rule. A word that *looks*
 * vowel-initial but starts with a consonant sound (the "y" of "university", the
 * "w" of "one") takes "a"; a word that looks consonant-initial but starts with
 * a vowel sound ("hour", "heir") takes "an".
 */
export const ARTICLE_A_EXCEPTIONS: ReadonlySet<string> = new Set([
  'university', 'universities', 'unique', 'uniform', 'uniformly', 'union',
  'unions', 'unit', 'units', 'unite', 'united', 'universal', 'universally',
  'universe', 'usage', 'use', 'used', 'useful', 'useless', 'user', 'users',
  'usual', 'usually', 'utility', 'utilities', 'utilize', 'utilise', 'utopia',
  'uranium', 'urine', 'european', 'europeans', 'eulogy', 'ewe', 'once', 'one',
  'ubiquitous', 'unanimous', 'unicorn', 'unify', 'unification', 'unilateral',
  'ukulele', 'url', 'us', 'uk', 'usa', 'unesco', 'unicef',
]);

export const ARTICLE_AN_EXCEPTIONS: ReadonlySet<string> = new Set([
  'hour', 'hours', 'hourly', 'honest', 'honestly', 'honesty', 'honour',
  'honours', 'honor', 'honors', 'honorable', 'honourable', 'heir', 'heiress',
  'herb', 'herbs',
]);

/** Build the plural of a curated count noun, falling back to the morphology. */
export function pluralOfCountNoun(noun: string): string {
  return pluralize(noun);
}

export { isVerbLemma };
