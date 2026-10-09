/**
 * PLACEMENT LIFECYCLE — SERVER-AUTHORITATIVE HELPERS
 * ---------------------------------------------------------------------------
 * `NOT_SELECTED` is deliberately NOT terminal: a student who is rejected by one
 * company keeps applying and interviewing with the next one. `PLACED` is the
 * only terminal state.
 *
 * Final-year scoping reuses the authoritative `Student.year` field — the same
 * rule the mentee export already uses (`year === 4`). A register number is
 * never inspected to guess a year.
 */
import {
  PLACEMENT_STATUSES,
  type PlacementStatus,
} from '../models/Placement.model.js';

export { PLACEMENT_STATUSES };
export type { PlacementStatus };

/** The authoritative definition of "final year" used across the application. */
export const FINAL_YEAR = 4;

export function isFinalYearStudent(student: { year?: number | null } | null | undefined): boolean {
  const year = Number((student as any)?.year);
  return year === FINAL_YEAR;
}

/**
 * Allowed placement-status transitions. Anything absent is rejected, so a
 * caller cannot reach a state by naming a different target.
 *
 * NOT_SELECTED -> APPLYING / INTERVIEW is the required "keep going" path.
 * PLACED is terminal (an accidental re-open must go through a correction, not
 * a status flip).
 */
export const PLACEMENT_TRANSITIONS: Readonly<Record<PlacementStatus, readonly PlacementStatus[]>> =
  Object.freeze({
    NOT_STARTED: ['TRAINING', 'APPLYING', 'NOT_PLACED'],
    TRAINING: ['NOT_STARTED', 'APPLYING', 'NOT_PLACED'],
    APPLYING: ['TRAINING', 'INTERVIEW', 'SELECTED', 'NOT_SELECTED', 'PLACED', 'NOT_PLACED'],
    INTERVIEW: ['APPLYING', 'SELECTED', 'NOT_SELECTED', 'PLACED', 'NOT_PLACED'],
    SELECTED: ['APPLYING', 'INTERVIEW', 'PLACED', 'NOT_SELECTED'],
    NOT_SELECTED: ['APPLYING', 'INTERVIEW', 'TRAINING', 'PLACED', 'NOT_PLACED'],
    PLACED: [],
    NOT_PLACED: ['TRAINING', 'APPLYING', 'INTERVIEW', 'PLACED'],
  });

export function canTransitionPlacementStatus(from: PlacementStatus, to: PlacementStatus): boolean {
  if (from === to) return true;
  const allowed = PLACEMENT_TRANSITIONS[from];
  return Array.isArray(allowed) ? allowed.includes(to) : false;
}

export function allowedPlacementTransitions(from: PlacementStatus): PlacementStatus[] {
  const allowed = PLACEMENT_TRANSITIONS[from];
  return Array.isArray(allowed) ? [...allowed] : [];
}

/** Fields the server derives so the stored row can never contradict itself. */
export interface PlacementDerivedFields {
  placed: boolean;
  notPlaced: boolean;
  overallStatus: PlacementStatus;
}

export function derivePlacementFields(
  overallStatus: PlacementStatus,
  explicitPlaced?: unknown
): PlacementDerivedFields {
  const placed = overallStatus === 'PLACED';
  const notPlaced = overallStatus === 'NOT_PLACED';
  // `explicitPlaced` is only honoured when it agrees with the status; the
  // status is the single source of truth.
  void explicitPlaced;
  return { placed, notPlaced, overallStatus };
}

export interface PlacementStatusCounts {
  notStarted: number;
  training: number;
  applying: number;
  interview: number;
  selected: number;
  notSelected: number;
  placed: number;
  notPlaced: number;
}

export function emptyPlacementCounts(): PlacementStatusCounts {
  return {
    notStarted: 0,
    training: 0,
    applying: 0,
    interview: 0,
    selected: 0,
    notSelected: 0,
    placed: 0,
    notPlaced: 0,
  };
}

const COUNT_FIELD: Readonly<Record<PlacementStatus, keyof PlacementStatusCounts>> = Object.freeze({
  NOT_STARTED: 'notStarted',
  TRAINING: 'training',
  APPLYING: 'applying',
  INTERVIEW: 'interview',
  SELECTED: 'selected',
  NOT_SELECTED: 'notSelected',
  PLACED: 'placed',
  NOT_PLACED: 'notPlaced',
});

export function tallyPlacementStatus(counts: PlacementStatusCounts, status: string): void {
  const field = COUNT_FIELD[status as PlacementStatus];
  if (field) counts[field] += 1;
}

/**
 * One shared shape for the placement summary every portal renders, so the
 * mentor view, the HOD dashboard and the tests can never disagree.
 */
export interface PlacementSummary extends PlacementStatusCounts {
  totalFinalYearStudents: number;
  withRecord: number;
  withoutRecord: number;
  inProgress: number;
  placementPercentage: number;
}

export function buildPlacementSummary(
  totalFinalYearStudents: number,
  counts: PlacementStatusCounts,
  withRecord: number
): PlacementSummary {
  const inProgress =
    counts.notStarted + counts.training + counts.applying + counts.interview + counts.selected + counts.notSelected;
  return {
    ...counts,
    totalFinalYearStudents,
    withRecord,
    withoutRecord: Math.max(0, totalFinalYearStudents - withRecord),
    inProgress,
    placementPercentage:
      totalFinalYearStudents > 0 ? Math.round((counts.placed / totalFinalYearStudents) * 100) : 0,
  };
}

/** Shared wording so a refusal reads the same on every endpoint. */
export const NOT_FINAL_YEAR_MESSAGE =
  'Placement monitoring is only available for final-year students.';
