/**
 * LEADERBOARD RANKING — PURE, DETERMINISTIC, SERVER-CALCULATED
 * ---------------------------------------------------------------------------
 * Ranking rule (locked):
 *   1. total verified achievement points   DESC
 *   2. total verified achievement count    DESC
 *   3. stable student identifier (register number) ASC
 *
 * There is no random ordering and no client-provided score anywhere in the
 * pipeline: candidates are built from stored, VERIFIED Achievement rows only,
 * and this module only decides their order.
 */

export interface LeaderboardCandidate {
  studentId: string;
  registerNumber: string;
  totalPoints: number;
  achievementCount: number;
  [key: string]: any;
}

/** Ascending, locale-independent, byte-stable comparison of register numbers. */
function compareRegisterNumber(a: string, b: string): number {
  const ra = String(a ?? '').toUpperCase();
  const rb = String(b ?? '').toUpperCase();
  if (ra < rb) return -1;
  if (ra > rb) return 1;
  return 0;
}

/** The one comparison used by every leaderboard scope. */
export function compareLeaderboardCandidates(a: LeaderboardCandidate, b: LeaderboardCandidate): number {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
  if (b.achievementCount !== a.achievementCount) return b.achievementCount - a.achievementCount;
  const byReg = compareRegisterNumber(a.registerNumber, b.registerNumber);
  if (byReg !== 0) return byReg;
  return compareRegisterNumber(a.studentId, b.studentId);
}

/**
 * Sort and assign 1..N ranks. Because register numbers are unique, the
 * comparison is total, so ranks are strictly sequential with no ties.
 */
export function rankLeaderboard<T extends LeaderboardCandidate>(
  entries: T[]
): Array<T & { rank: number }> {
  return [...entries]
    .sort(compareLeaderboardCandidates)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** Rank of one entry in an already-ranked list, or null when absent. */
export function findRank(
  ranked: Array<LeaderboardCandidate & { rank: number }>,
  studentId: string
): number | null {
  const hit = ranked.find((e) => String(e.studentId) === String(studentId));
  return hit ? hit.rank : null;
}
