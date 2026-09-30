/**
 * MEETING DATE PRESENTATION
 * ---------------------------------------------------------------------------
 * All meeting labels are derived from the ACTUAL meeting date stored in
 * MongoDB — never from a computed "next Saturday". If the stored date changes,
 * the label changes with it.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type MeetingPhase = 'PAST' | 'TODAY' | 'TOMORROW' | 'UPCOMING_SATURDAY' | 'UPCOMING';

export interface MeetingDateLabel {
  phase: MeetingPhase;
  /** Short badge/title text. */
  title: string;
  /** Full sentence used in notification bodies. */
  description: string;
  /** "DD Month YYYY" */
  formatted: string;
  isUpcoming: boolean;
}

/** Parse a stored meeting date (Date | ISO string | "YYYY-MM-DD") into a local midnight Date. */
export function parseMeetingDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    const d = new Date(value.getTime());
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(`${trimmed}T00:00:00`);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      const d = new Date(`${year}-${month}-${day}T00:00:00`);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
  return null;
}

export function startOfToday(now = new Date()): Date {
  const d = new Date(now.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/** Whole-day difference between a meeting date and today (negative = past). */
export function daysFromToday(meetingDate: any, now = new Date()): number | null {
  const d = parseMeetingDate(meetingDate);
  if (!d) return null;
  return Math.round((d.getTime() - startOfToday(now).getTime()) / 86_400_000);
}

export function formatMeetingDate(value: any): string {
  const d = parseMeetingDate(value);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatMeetingDateLong(value: any): string {
  const d = parseMeetingDate(value);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Classify a meeting date.
 *  today                       -> Today's Meeting
 *  tomorrow                   -> Tomorrow's Meeting
 *  a future Saturday           -> Upcoming Saturday Meeting
 *  any other future date       -> Upcoming Meeting — DD Month YYYY
 *  anything already passed     -> PAST (must not be presented as current)
 */
export function describeMeetingDate(meetingDate: any, now = new Date()): MeetingDateLabel {
  const d = parseMeetingDate(meetingDate);
  if (!d) {
    return {
      phase: 'PAST',
      title: 'No Meeting Date',
      description: 'No meeting date has been recorded.',
      formatted: '',
      isUpcoming: false,
    };
  }

  const today = startOfToday(now);
  const diff = daysFromToday(d, now);
  const formatted = formatMeetingDate(d);
  const long = formatMeetingDateLong(d);

  if (diff === null || diff < 0) {
    return {
      phase: 'PAST',
      title: 'Past Meeting',
      description: `This meeting took place on ${long}.`,
      formatted,
      isUpcoming: false,
    };
  }

  if (diff === 0) {
    return {
      phase: 'TODAY',
      title: "Today's Meeting",
      description: `Today (${long}) is your Mentor–Mentee meeting.`,
      formatted,
      isUpcoming: true,
    };
  }

  if (diff === 1) {
    return {
      phase: 'TOMORROW',
      title: "Tomorrow's Meeting",
      description: `Tomorrow (${long}) is your Mentor–Mentee meeting.`,
      formatted,
      isUpcoming: true,
    };
  }

  if (d.getDay() === 6) {
    return {
      phase: 'UPCOMING_SATURDAY',
      title: 'Upcoming Saturday Meeting',
      description: `Your upcoming Saturday Mentor–Mentee meeting is on ${long}.`,
      formatted,
      isUpcoming: true,
    };
  }

  return {
    phase: 'UPCOMING',
    title: `Upcoming Meeting — ${formatted}`,
    description: `Your upcoming Mentor–Mentee meeting is on ${long}.`,
    formatted,
    isUpcoming: true,
  };
}
