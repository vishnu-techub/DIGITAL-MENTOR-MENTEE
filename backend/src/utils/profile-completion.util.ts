/**
 * Profile completion — SINGLE SOURCE OF TRUTH.
 *
 * The percentage is derived from exactly four equally-weighted buckets, the same
 * definition the student directory (`getStudents`) has always used:
 *
 *   1. Identity      — full name + register number
 *   2. Contact       — mobile number + email + date of birth
 *   3. Family        — at least one parent name
 *   4. School        — 10th or 12th standard mark
 *
 * `profileCompleted` (set only when the onboarding wizard is submitted) is
 * authoritative: when it is true the profile is 100% by definition, regardless
 * of how the individual buckets currently read.
 *
 * This helper exists so `getStudents` and `getStudentById` can never drift:
 * both now report the same `profile_completion_percentage` for a given student,
 * and the detail endpoint can additionally explain what is still missing.
 */
export interface ProfileCompletionResult {
  /** 0, 25, 50, 75 or 100. */
  percentage: number;
  /** Human-readable bucket labels that are still incomplete (empty when 100). */
  missing: string[];
  /** True when the stored wizard flag marks the profile complete. */
  completed: boolean;
}

export function calculateProfileCompletion(student: any): ProfileCompletionResult {
  const completed = student?.profileCompleted === true;

  if (completed) {
    return { percentage: 100, missing: [], completed: true };
  }

  const missing: string[] = [];
  let percentage = 0;

  // 1. Identity
  if (student?.fullName && student?.registerNumber) {
    percentage += 25;
  } else {
    missing.push('Personal details');
  }

  // 2. Contact
  if (student?.mobileNumber && student?.email && student?.dob) {
    percentage += 25;
  } else {
    missing.push('Contact details');
  }

  // 3. Family
  if (student?.parent?.fatherName || student?.parent?.motherName) {
    percentage += 25;
  } else {
    missing.push('Family details');
  }

  // 4. School
  if (student?.school?.tenthMark || student?.school?.twelfthMark) {
    percentage += 25;
  } else {
    missing.push('School details');
  }

  return { percentage, missing, completed: false };
}
