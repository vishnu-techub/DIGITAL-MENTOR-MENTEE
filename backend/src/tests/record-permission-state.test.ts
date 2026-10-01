/**
 * The permission state machine, tested directly.
 *
 * These are pure functions with no database or HTTP dependency, so this suite
 * is the fast, deterministic guard on the rules that must never regress:
 *   - an upload can never be verified
 *   - PENDING and SUBMITTED are read-only for the student
 *   - APPROVED / EDITING / REJECTED are editable
 *   - only a SUBMITTED record can reach CONFIRMED
 *   - CONFIRMED is terminal: no transition out of it, ever
 *   - a non-mentor can never perform a mentor transition
 *
 * Run with:  npm --prefix backend run test:state-machine
 */
import {
  RECORD_STATE,
  RECORD_STATES,
  REVIEWABLE_STATES,
  STUDENT_EDITABLE_STATES,
  canTransition,
  canStudentTransition,
  deriveRecordPermissions,
  isMentorRole,
  isTerminal,
} from '../utils/record-permission.util.js';
import { ROLES } from '../config/constants.js';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(requirement: string, condition: boolean, evidence = '') {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${requirement}`);
  } else {
    fail++;
    failures.push(requirement);
    console.log(`  [FAIL] ${requirement}${evidence ? `\n         evidence: ${evidence}` : ''}`);
  }
}

console.log('\n=== Record permission state machine ===\n');

// ---------------------------------------------------------------------------
console.log('Vocabulary');
// ---------------------------------------------------------------------------
check('six persisted states', RECORD_STATES.length === 6, `got ${RECORD_STATES.length}`);
check(
  'states are exactly the specified machine',
  ['Pending', 'Approved', 'Editing', 'Submitted', 'Verified', 'Rejected'].every((s) =>
    (RECORD_STATES as readonly string[]).includes(s)
  ),
  RECORD_STATES.join(', ')
);
check(
  'CONFIRMED is stored as Verified, not a new value',
  RECORD_STATE.CONFIRMED === 'Verified'
);

// ---------------------------------------------------------------------------
console.log('\nUpload must never verify');
// ---------------------------------------------------------------------------
{
  const p = deriveRecordPermissions(RECORD_STATE.PENDING, ROLES.STUDENT);
  check('a fresh upload is PENDING, not VERIFIED', p.state === 'Pending');
  check('a fresh upload is read-only for the student', p.canEdit === false && p.canDelete === false);
  check('a fresh upload cannot be submitted', p.canSubmit === false);
  check('a read-only record carries a reason', !!p.reason, `reason = ${p.reason}`);
}

// ---------------------------------------------------------------------------
console.log('\nStudent permissions per state');
// ---------------------------------------------------------------------------
{
  const expected: Array<[string, boolean, string]> = [
    ['Pending', false, 'waiting for mentor approval'],
    ['Approved', true, 'approved means editable'],
    ['Editing', true, 'editing in progress'],
    ['Submitted', false, 'submitted is read-only'],
    ['Verified', false, 'confirmed is permanently read-only'],
    ['Rejected', true, 'rejected may be corrected'],
  ];
  for (const [state, shouldEdit, why] of expected) {
    const p = deriveRecordPermissions(state, ROLES.STUDENT);
    check(`student canEdit === ${shouldEdit} in ${state} (${why})`, p.canEdit === shouldEdit);
    check(`student canDelete === ${shouldEdit} in ${state}`, p.canDelete === shouldEdit);
    if (shouldEdit) {
      check(`an editable record offers no read-only reason in ${state}`, p.reason === null);
    } else {
      check(`a read-only record explains itself in ${state}`, !!p.reason);
    }
  }
}

check(
  'CONFIRMED is flagged locked',
  deriveRecordPermissions(RECORD_STATE.CONFIRMED, ROLES.STUDENT).locked === true
);
check(
  'no other state is locked',
  RECORD_STATES.filter((s) => s !== RECORD_STATE.CONFIRMED).every(
    (s) => deriveRecordPermissions(s, ROLES.STUDENT).locked === false
  )
);
check(
  'CONFIRMED is displayed as VERIFIED',
  deriveRecordPermissions(RECORD_STATE.CONFIRMED, ROLES.STUDENT).label === 'VERIFIED'
);
check(
  'every state has a non-empty explanation',
  RECORD_STATES.every((s) => (deriveRecordPermissions(s, ROLES.STUDENT).explanation || '').length > 0)
);

// ---------------------------------------------------------------------------
console.log('\nMentor permissions per state');
// ---------------------------------------------------------------------------
{
  for (const role of [ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN]) {
    check(`${role} can review a PENDING record`, deriveRecordPermissions('Pending', role).canReview === true);
    check(`${role} can confirm a SUBMITTED record`, deriveRecordPermissions('Submitted', role).canConfirm === true);
    check(
      `${role} CANNOT confirm a PENDING record (must approve first)`,
      deriveRecordPermissions('Pending', role).canConfirm === false
    );
    check(
      `${role} cannot review a CONFIRMED record`,
      deriveRecordPermissions('Verified', role).canReview === false
    );
  }
check(
  'a student is never given mentor capabilities',
  deriveRecordPermissions('Pending', ROLES.STUDENT).canReview === false &&
    deriveRecordPermissions('Submitted', ROLES.STUDENT).canConfirm === false
);

// ---------------------------------------------------------------------------
console.log('\nA mentor is never given the owner\'s capabilities');
// ---------------------------------------------------------------------------
{
  for (const role of [ROLES.FACULTY, ROLES.HOD, ROLES.ADMIN]) {
    for (const state of RECORD_STATES) {
      const p = deriveRecordPermissions(state, role);
      check(
        `${role} cannot EDIT a ${state} record (only the owner edits)`,
        p.canEdit === false
      );
      check(
        `${role} cannot SUBMIT a ${state} record (only the owner submits)`,
        p.canSubmit === false
      );
      check(
        `${role} is given no student read-only reason on a ${state} record`,
        p.reason === null
      );
    }
    check(`${role} keeps housekeeping delete on PENDING`, deriveRecordPermissions('Pending', role).canDelete === true);
    check(
      `${role} has NO delete on a confirmed record`,
      deriveRecordPermissions('Verified', role).canDelete === false
    );
  }
  check(
    'a student with no deletable state cannot delete',
    deriveRecordPermissions('Pending', ROLES.STUDENT).canDelete === false
  );
}
  check(
    'reviewable states are Pending, Submitted and Rejected',
    [...REVIEWABLE_STATES].sort().join(',') === ['Pending', 'Rejected', 'Submitted'].sort().join(','),
    REVIEWABLE_STATES.join(',')
  );
  check(
    'student-editable states are Approved, Editing and Rejected',
    [...STUDENT_EDITABLE_STATES].sort().join(',') === ['Approved', 'Editing', 'Rejected'].sort().join(','),
    STUDENT_EDITABLE_STATES.join(',')
  );
}

// ---------------------------------------------------------------------------
console.log('\nMentor transitions');
// ---------------------------------------------------------------------------
check('PENDING -> APPROVED', canTransition('Pending', 'Approved', ROLES.FACULTY));
check('PENDING -> REJECTED', canTransition('Pending', 'Rejected', ROLES.FACULTY));
check('SUBMITTED -> CONFIRMED', canTransition('Submitted', 'Verified', ROLES.FACULTY));
check('SUBMITTED -> REJECTED', canTransition('Submitted', 'Rejected', ROLES.FACULTY));
check('REJECTED -> APPROVED', canTransition('Rejected', 'Approved', ROLES.FACULTY));
check(
  'PENDING -> CONFIRMED is refused (approval must come first)',
  canTransition('Pending', 'Verified', ROLES.FACULTY) === false
);
check(
  'SUBMITTED -> APPROVED is refused',
  canTransition('Submitted', 'Approved', ROLES.FACULTY) === false
);
check(
  'APPROVED -> CONFIRMED is refused (student must submit first)',
  canTransition('Approved', 'Verified', ROLES.FACULTY) === false
);
check(
  'EDITING -> CONFIRMED is refused (student must submit first)',
  canTransition('Editing', 'Verified', ROLES.FACULTY) === false
);

// ---------------------------------------------------------------------------
console.log('\nA non-mentor can never transition');
// ---------------------------------------------------------------------------
{
  const pairs: Array<[string, string]> = [
    ['Pending', 'Approved'],
    ['Pending', 'Verified'],
    ['Submitted', 'Verified'],
    ['Rejected', 'Verified'],
  ];
  for (const [from, to] of pairs) {
    check(
      `student cannot perform ${from} -> ${to}`,
      canTransition(from, to, ROLES.STUDENT) === false
    );
  }
  check('HOD counts as a mentor', isMentorRole(ROLES.HOD));
  check('ADMIN counts as a mentor', isMentorRole(ROLES.ADMIN));
  check('a null role is not a mentor', isMentorRole(null) === false);
}

// ---------------------------------------------------------------------------
console.log('\nStudent transitions');
// ---------------------------------------------------------------------------
check('APPROVED -> SUBMITTED', canStudentTransition('Approved', 'Submitted'));
check('EDITING -> SUBMITTED', canStudentTransition('Editing', 'Submitted'));
check('REJECTED -> SUBMITTED (resubmission path)', canStudentTransition('Rejected', 'Submitted'));
check('REJECTED -> EDITING', canStudentTransition('Rejected', 'Editing'));
check(
  'PENDING -> SUBMITTED is refused',
  canStudentTransition('Pending', 'Submitted') === false
);
check(
  'SUBMITTED -> SUBMITTED is refused',
  canStudentTransition('Submitted', 'Submitted') === false
);

// ---------------------------------------------------------------------------
console.log('\nCONFIRMED is terminal');
// ---------------------------------------------------------------------------
{
  check('isTerminal(Verified)', isTerminal('Verified') === true);
  const everyState = RECORD_STATES;
  let anyOut = false;
  for (const from of everyState) {
    for (const to of everyState) {
      if (from === 'Verified' && (canTransition(from, to, ROLES.ADMIN) || canStudentTransition(from, to))) {
        anyOut = true;
      }
    }
  }
  check('no transition exists out of CONFIRMED, for any role', anyOut === false);
  check(
    'a student cannot save a confirmed record',
    canStudentTransition('Verified', 'Approved') === false
  );
  check(
    'a student cannot resubmit a confirmed record',
    canStudentTransition('Verified', 'Submitted') === false
  );
  check(
    'an admin cannot reopen a confirmed record',
    canTransition('Verified', 'Rejected', ROLES.ADMIN) === false
  );
}

// ---------------------------------------------------------------------------
console.log('\nUnknown / malformed state fails safe');
// ---------------------------------------------------------------------------
{
  const junk = deriveRecordPermissions('TOTALLY_BOGUS', ROLES.STUDENT);
  check('an unknown state does not grant edit', junk.canEdit === false);
  check('an unknown state is reported, not silently editable', junk.state === 'Pending');
  check('an unknown state still yields a reason', !!junk.reason);
  check('a null status does not grant edit', deriveRecordPermissions(null, ROLES.STUDENT).canEdit === false);
  check('a missing role grants no mentor powers', deriveRecordPermissions('Submitted', undefined).canConfirm === false);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
if (fail > 0) {
  console.error('FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
