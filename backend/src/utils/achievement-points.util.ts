/**
 * ACHIEVEMENT POINT TABLE — SERVER-AUTHORITATIVE
 * ---------------------------------------------------------------------------
 * Points are NEVER taken from the client. Every row's `points` (the value the
 * achievement is worth) and `pointsAwarded` (the value actually credited) are
 * computed here and written by the server only.
 *
 *   Unverified achievement  -> 0 points (pointsAwarded stays 0)
 *   Verified achievement    -> pointsAwarded = calculateAchievementPoints(...)
 *
 * `pointsAwarded` is the authoritative leaderboard value; `points` is the
 * potential value of the row as its category/result stand right now.
 */
import type { AchievementCategory, HackathonResult } from '../models/Achievement.model.js';

/** The written point table. Mirrors the specification exactly. */
export const ACHIEVEMENT_POINT_TABLE: Readonly<Record<string, number>> = Object.freeze({
  'Hackathon Winner': 25,
  'Hackathon Runner-up': 20,
  'Hackathon Finalist': 15,
  'Hackathon Participation': 10,
  'Symposium / Paper Presentation': 8,
  'Global / Technical Certification': 8,
  Workshop: 5,
  'Competition / Event': 5,
  'Project / Technical Achievement': 10,
});

const HACKATHON_RESULT_POINTS: Readonly<Record<HackathonResult, number>> = Object.freeze({
  Winner: ACHIEVEMENT_POINT_TABLE['Hackathon Winner'],
  'Runner-up': ACHIEVEMENT_POINT_TABLE['Hackathon Runner-up'],
  Finalist: ACHIEVEMENT_POINT_TABLE['Hackathon Finalist'],
  Participation: ACHIEVEMENT_POINT_TABLE['Hackathon Participation'],
});

/** Categories whose points come from the table directly (no result needed). */
const FLAT_POINT_CATEGORIES: Readonly<Partial<Record<AchievementCategory, number>>> = Object.freeze({
  'Symposium / Paper Presentation': ACHIEVEMENT_POINT_TABLE['Symposium / Paper Presentation'],
  'Global / Technical Certification': ACHIEVEMENT_POINT_TABLE['Global / Technical Certification'],
  Workshop: ACHIEVEMENT_POINT_TABLE['Workshop'],
  'Competition / Event': ACHIEVEMENT_POINT_TABLE['Competition / Event'],
  'Project / Technical Achievement': ACHIEVEMENT_POINT_TABLE['Project / Technical Achievement'],
});

/** Human label for a row, used in refusal messages and audit details. */
export function achievementPointLabel(category: string, hackathonResult?: string | null): string {
  if (category === 'Hackathon') {
    return hackathonResult ? `Hackathon ${hackathonResult}` : 'Hackathon';
  }
  return category;
}

/**
 * Points a row is worth in its current state.
 *
 * Returns 0 for `Other` (not on the point table) and for a Hackathon row with
 * no recorded result — the verifier must record the result first, so a result
 * can never be inferred after verification.
 */
export function calculateAchievementPoints(
  category: string,
  hackathonResult?: string | null
): number {
  if (category === 'Hackathon') {
    if (!hackathonResult) return 0;
    return HACKATHON_RESULT_POINTS[hackathonResult as HackathonResult] ?? 0;
  }
  const flat = FLAT_POINT_CATEGORIES[category as AchievementCategory];
  return typeof flat === 'number' ? flat : 0;
}

/** True when the category participates in the point table at all. */
export function isPointBearingCategory(category: string): boolean {
  return calculateAchievementPoints(category, 'Winner') > 0;
}

/**
 * Verification refusal for a row that cannot be credited yet.
 * Returns null when the row is ready to be verified.
 */
export function achievementVerificationRefusal(
  category: string,
  hackathonResult?: string | null
): string | null {
  if (category === 'Hackathon' && !hackathonResult) {
    return 'Record the hackathon result (Winner / Runner-up / Finalist / Participation) before verifying, so the awarded points are unambiguous.';
  }
  if (category === 'Other') {
    return 'The "Other" category is not on the achievement point table, so it cannot award leaderboard points.';
  }
  return null;
}
