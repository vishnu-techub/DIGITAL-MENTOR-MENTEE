/**
 * HOD MANAGEMENT — ADMIN-ONLY ACCOUNT SURFACE
 * ---------------------------------------------------------------------------
 * Creates, edits and deactivates Head-of-Department accounts. A HOD is exactly
 * one `User` with `role: 'HOD'` plus a single `department` reference — there is
 * no separate Hod model, and this module deliberately does not introduce one.
 *
 * Rules enforced here (not in the frontend):
 *   - every handler re-checks `req.user.role === ADMIN`, so mounting one of
 *     these functions on any other router still cannot make it reachable by a
 *     HOD / FACULTY / STUDENT account;
 *   - one department carries at most ONE active HOD. Deactivating a HOD frees
 *     the department for a successor (deactivate is the standard removal path —
 *     nothing here ever deletes a User, so historical mentoring and academic
 *     records keep their author). The ONE exception is `deleteHod`: an Admin
 *     may PERMANENTLY delete an INACTIVE HOD only when that HOD is on the
 *     reviewed demo-cleanup allowlist (`VERIFIED_DEMO_HOD_IDS`) AND no
 *     historical record references it — the audit log is preserved either way;
 *   - role is always written as 'HOD' and can never be changed through these
 *     endpoints;
 *   - department isolation of the verified `/api/hod/*` surface is untouched:
 *     this file does not read or write any mentoring record.
 */
import { Response } from 'express';
import bcrypt from 'bcryptjs';
import {
  User,
  Department,
  Notification,
  MentorAssignment,
  SystemSetting,
  StudentDocument,
  Achievement,
  Placement,
  AcademicEditRequest,
  StudentEditRequest,
  InternalMark,
  MarkEntryPermission,
  MarkUpdateRequest,
  CounsellingRecord,
  Meeting,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { toIdString } from '../../utils/access.util.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { ROLES } from '../../config/constants.js';
import { parseEmail, joinErrors } from '../../utils/validation.util.js';
import { isValidId } from '../../services/localId.js';

/** Default password follows the same convention as faculty / student creation. */
const DEFAULT_PASSWORD = 'Password@123';
const MIN_PASSWORD_LENGTH = 6;

/**
 * EXPLICIT, REVIEWED ALLOWLIST of the confirmed demo/test HOD accounts in the
 * live store. Membership is the ONLY gate that allows permanent deletion.
 *
 * A HOD is NEVER identified as a demo account by username, department or
 * display name — only by this allowlist, which was built from the audit trail
 * (scripted CREATE_HOD → LOGIN → DEACTIVATE_HOD verification accounts, literal
 * "Sample"/"Verify HOD"/hook-reproduction QA accounts) plus a full reference
 * scan proving they hold no dependent records. Do not extend this list without
 * first verifying provenance the same way.
 *
 * Every other deletion precondition is still enforced independently:
 *  - the account must be inactive (deactivated),
 *  - no dependent records may reference it (the preserved audit log excluded),
 *  - only an Admin may call the endpoint.
 *
 * Exported so the test suites can inject their own sandbox-generated ids into
 * the shared Set and prove the verified-demo gate without touching the values
 * that ship for the live store.
 */
export const VERIFIED_DEMO_HOD_IDS = new Set<string>([
  '6ac54c64bf8e51bf077b621a', // vhod.verify.cse001 — "Verify HOD CSE"
  '6ac54fab1c46076cfe3f4fad', // vhod.live883485 — "Verify HOD Live"
  '6ac71fad1eaea0d41fdae057', // hod.it — "Sample HOD IT"
  '6ac7411e5803a74d64b59194', // hookrepro.hod — "HODMECH"
  '6ac743565803a74d64b5919b', // hookrepro.it — "Hook Repro HOD IT"
]);

export interface HodRow {
  id: string;
  username: string;
  full_name: string;
  email: string;
  department_id: string;
  department_name: string;
  department_code: string;
  is_active: 0 | 1;
  /** 1 only for accounts on the reviewed demo-cleanup allowlist. */
  is_verified_demo: 0 | 1;
  last_login_at: string | null;
  created_at: string | null;
}

/**
 * Second line of defence behind `authorize(ROLES.ADMIN)`. Returns true (and
 * sends the 403) when the caller is not an Administrator.
 */
function refuseUnlessAdmin(req: AuthRequest, res: Response): boolean {
  if (!req.user || req.user.role !== ROLES.ADMIN) {
    sendError(res, 'You are not authorized to perform this operation.', 403);
    return true;
  }
  return false;
}

async function buildDepartmentMap(): Promise<Map<string, { name: string; code: string }>> {
  const depts = await Department.find().sort({ code: 1 });
  const map = new Map<string, { name: string; code: string }>();
  for (const d of depts) {
    const key = toIdString(d._id);
    if (key) map.set(key, { name: d.name, code: d.code });
  }
  return map;
}

function toHodRow(
  user: any,
  deptMap: Map<string, { name: string; code: string }>
): HodRow {
  const deptId = toIdString(user.department) || '';
  const dept = deptMap.get(deptId);
  return {
    id: String(user._id),
    username: user.username || '',
    full_name: user.fullName || '',
    email: user.email || '',
    department_id: deptId,
    department_name: dept?.name || '',
    department_code: dept?.code || '',
    is_active: user.isActive === false ? 0 : 1,
    is_verified_demo: VERIFIED_DEMO_HOD_IDS.has(String(user._id)) ? 1 : 0,
    last_login_at: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
    created_at: user.createdAt ? new Date(user.createdAt).toISOString() : null,
  };
}

/** Accepts an id, a department code or a department name — same as `createFaculty`. */
async function resolveDepartment(input: unknown): Promise<any | null> {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return null;
  if (isValidId(raw)) {
    const byId = await Department.findById(raw);
    if (byId) return byId;
  }
  return Department.findOne({
    $or: [{ code: raw.toUpperCase() }, { name: raw }],
  });
}

/**
 * The single HOD-per-department rule. Only **active** HODs hold the slot, so
 * deactivating a HOD lets the Admin appoint a successor without ever deleting
 * the original account (and without orphaning its historical records).
 * `excludeUserId` keeps an edit of the HOD already in the slot legal.
 */
async function findActiveHodInDepartment(departmentId: string, excludeUserId?: string) {
  const target = toIdString(departmentId);
  const hods = await User.find({ role: ROLES.HOD });
  for (const h of hods) {
    if (toIdString(h.department) !== target) continue;
    if (h.isActive === false) continue;
    if (skip(excludeUserId, h)) continue;
    return h;
  }
  return null;
}

function skip(excludeUserId: string | undefined, h: any): boolean {
  return Boolean(excludeUserId) && toIdString(h._id) === toIdString(excludeUserId);
}

async function isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
  const existing = await User.findOne({ username });
  if (!existing) return false;
  return !excludeUserId || String(existing._id) !== String(excludeUserId);
}

async function isEmailTaken(email: string, excludeUserId?: string): Promise<boolean> {
  const existing = await User.findOne({ email });
  if (!existing) return false;
  return !excludeUserId || String(existing._id) !== String(excludeUserId);
}

/** `jane.mary@x.com` -> `jane.mary`, uniquified against the User collection. */
async function deriveUsername(emailLocal: string, excludeUserId?: string): Promise<string> {
  let base = emailLocal.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40);
  if (!base) base = 'hod';
  if (!(await isUsernameTaken(base, excludeUserId))) return base;
  for (let i = 2; i < 500; i++) {
    const candidate = `${base}${i}`;
    if (!(await isUsernameTaken(candidate, excludeUserId))) return candidate;
  }
  return `${base}${Date.now()}`;
}

/* ------------------------------------------------------------------ LIST */

/**
 * GET /api/admin/hods
 * Every HOD account with its department, for the Admin HOD Management table.
 */
export async function getHodList(req: AuthRequest, res: Response) {
  if (refuseUnlessAdmin(req, res)) return;
  try {
    const hods = await User.find({ role: ROLES.HOD }).sort({ fullName: 1 });
    const deptMap = await buildDepartmentMap();
    const list = hods.map((h) => toHodRow(h, deptMap));

    const active = list.filter((h) => h.is_active === 1).length;
    return sendSuccess(res, {
      hods: list,
      summary: { total: list.length, active, inactive: list.length - active },
    });
  } catch (err: any) {
    console.error('getHodList error:', err);
    return sendError(res, 'Failed to fetch HOD list.', 500);
  }
}

/* ---------------------------------------------------------------- CREATE */

/**
 * POST /api/admin/hods
 * Body: fullName, email, departmentId [, username] [, password] [, isActive]
 * Creates a User with role = HOD and exactly one department. Refuses a second
 * active HOD for a department (409) and any duplicate email / username (409).
 */
export async function createHod(req: AuthRequest, res: Response) {
  if (refuseUnlessAdmin(req, res)) return;

  const { fullName, email, departmentId, username, password, isActive } = req.body || {};

  const errors: string[] = [];
  if (!fullName || !String(fullName).trim()) errors.push('Full name is required.');
  if (!departmentId || !String(departmentId).trim()) errors.push('Department is required.');
  const emailCheck = parseEmail(email, true);
  if (!emailCheck.ok) errors.push(emailCheck.error!);
  if (password !== undefined && password !== null && String(password) !== '') {
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
  }
  if (errors.length) return sendError(res, joinErrors(errors), 400, errors);

  const mail = String(emailCheck.value).toLowerCase();
  const name = String(fullName).trim();

  try {
    const deptDoc = await resolveDepartment(departmentId);
    if (!deptDoc) {
      return sendError(res, 'Valid department is required.', 400);
    }

    const clash = await findActiveHodInDepartment(deptDoc._id);
    if (clash) {
      return sendError(
        res,
        `${deptDoc.name} already has an active HOD (${clash.fullName}). Deactivate or reassign that HOD first.`,
        409
      );
    }

    if (await isEmailTaken(mail)) {
      return sendError(res, 'Email already registered.', 409);
    }

    const explicitUsername =
      username !== undefined && username !== null && String(username).trim() !== ''
        ? String(username).trim().toLowerCase()
        : '';
    if (explicitUsername && (await isUsernameTaken(explicitUsername))) {
      return sendError(res, 'Username already registered.', 409);
    }
    const uName = explicitUsername || (await deriveUsername(mail.split('@')[0] || 'hod'));

    const rawPassword =
      password !== undefined && password !== null && String(password) !== ''
        ? String(password)
        : DEFAULT_PASSWORD;
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const user = await User.create({
      username: uName,
      passwordHash,
      role: 'HOD',
      email: mail,
      fullName: name,
      department: deptDoc._id,
      isActive: isActive === false ? false : true,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_HOD',
      entity: 'USER',
      entityId: user._id.toString(),
      details: { username: uName, fullName: name, email: mail, departmentId: deptDoc._id.toString() },
      req,
    });

    const deptMap = await buildDepartmentMap();
    return sendSuccess(res, toHodRow(user, deptMap), 'HOD account created successfully.', 201);
  } catch (err: any) {
    console.error('createHod error:', err);
    if (err?.code === 11000 || /must be unique/i.test(err?.message || '')) {
      return sendError(res, 'Username or Email already registered.', 409);
    }
    return sendError(res, 'Failed to create HOD account.', 500);
  }
}

/* ---------------------------------------------------------------- UPDATE */

/**
 * PUT /api/admin/hods/:hodId
 * Body: fullName, email, departmentId, isActive (all optional; only the
 * supplied fields change). Re-runs the one-active-HOD-per-department rule
 * against the *other* HODs, so an edit can never produce a duplicate pair.
 */
export async function updateHod(req: AuthRequest, res: Response) {
  if (refuseUnlessAdmin(req, res)) return;

  const hodId = req.params.hodId as string;
  if (!isValidId(hodId)) return sendError(res, 'HOD not found.', 404);

  const { fullName, email, departmentId, isActive } = req.body || {};

  try {
    const user = await User.findById(hodId);
    if (!user || user.role !== ROLES.HOD) {
      return sendError(res, 'HOD not found.', 404);
    }

    const errors: string[] = [];
    if (fullName !== undefined && !String(fullName).trim()) {
      errors.push('Full name cannot be empty.');
    }
    let mail: string | undefined;
    if (email !== undefined) {
      const emailCheck = parseEmail(email, true);
      if (!emailCheck.ok) errors.push(emailCheck.error!);
      else mail = String(emailCheck.value).toLowerCase();
    }
    if (isActive !== undefined && typeof isActive !== 'boolean') {
      errors.push('Status must be a boolean.');
    }
    if (errors.length) return sendError(res, joinErrors(errors), 400, errors);

    let deptDoc: any = null;
    if (departmentId !== undefined) {
      deptDoc = await resolveDepartment(departmentId);
      if (!deptDoc) return sendError(res, 'Valid department is required.', 400);

      const otherHod = await findActiveHodInDepartment(deptDoc._id, user._id);
      if (otherHod) {
        return sendError(
          res,
          `${deptDoc.name} already has an active HOD (${otherHod.fullName}). A department can only have one.`,
          409
        );
      }
    }

    if (mail && (await isEmailTaken(mail, user._id))) {
      return sendError(res, 'Email already registered.', 409);
    }

    if (fullName !== undefined) user.fullName = String(fullName).trim();
    if (mail !== undefined) user.email = mail;
    if (deptDoc) user.department = deptDoc._id;
    if (isActive !== undefined) user.isActive = isActive;
    // Role and department are the two things that define a HOD; neither the
    // request body nor any caller can change the role here.
    user.role = 'HOD';

    await user.save();

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_HOD',
      entity: 'USER',
      entityId: user._id.toString(),
      details: {
        fullName: user.fullName,
        email: user.email,
        departmentId: toIdString(user.department) || '',
        isActive: user.isActive !== false,
      },
      req,
    });

    const deptMap = await buildDepartmentMap();
    return sendSuccess(res, toHodRow(user, deptMap), 'HOD updated successfully.');
  } catch (err: any) {
    console.error('updateHod error:', err);
    if (err?.code === 11000 || /must be unique/i.test(err?.message || '')) {
      return sendError(res, 'Email already registered.', 409);
    }
    return sendError(res, 'Failed to update HOD account.', 500);
  }
}

/* --------------------------------------------------------------- DEACTIVATE */

/**
 * PATCH /api/admin/hods/:hodId/status
 * Body: { isActive: boolean }
 *
 * Deactivation flips `User.isActive` and nothing else: the account, its
 * department link and every mentoring / academic record it authored are
 * retained. An inactive HOD cannot log in (the auth controller refuses
 * inactive users), so the department slot is freed for a successor — but
 * only a full Admin can perform either step. Reactivation re-checks that no
 * other active HOD has since taken the department.
 */
export async function setHodStatus(req: AuthRequest, res: Response) {
  if (refuseUnlessAdmin(req, res)) return;

  const hodId = req.params.hodId as string;
  if (!isValidId(hodId)) return sendError(res, 'HOD not found.', 404);

  const { isActive } = req.body || {};
  if (typeof isActive !== 'boolean') {
    return sendError(res, 'Status must be a boolean.', 400);
  }

  try {
    const user = await User.findById(hodId);
    if (!user || user.role !== ROLES.HOD) {
      return sendError(res, 'HOD not found.', 404);
    }

    if (isActive === true && user.department) {
      const otherHod = await findActiveHodInDepartment(user.department, user._id);
      if (otherHod) {
        return sendError(
          res,
          `Cannot reactivate: ${otherHod.fullName} is already the active HOD of this department.`,
          409
        );
      }
    }

    user.isActive = isActive;
    await user.save();

    await logAudit({
      userId: req.user!.id,
      action: isActive ? 'ACTIVATE_HOD' : 'DEACTIVATE_HOD',
      entity: 'USER',
      entityId: user._id.toString(),
      details: { fullName: user.fullName, departmentId: toIdString(user.department) || '' },
      req,
    });

    const deptMap = await buildDepartmentMap();
    return sendSuccess(
      res,
      toHodRow(user, deptMap),
      isActive
        ? 'HOD account reactivated successfully.'
        : 'HOD account deactivated. Historical records are retained.'
    );
  } catch (err: any) {
    console.error('setHodStatus error:', err);
    return sendError(res, 'Failed to update HOD status.', 500);
  }
}

/* ------------------------------------------------------------ PERMANENT DELETE */

/**
 * Every model field that can hold a *User* id — i.e. everything that could
 * reference a HOD account. CounsellingRecord / Meeting `evidence[].addedBy`
 * stores the author's USER id (mentor uploads), so those array paths are scanned
 * too. Collections that reference Faculty / Student / Department ids only
 * (`counselling_records.*`, `meetings.*`, `monthly_progresses.*`,
 * `academic_records.*`, `mentor_assignments.mentor`, …) cannot hold a HOD user
 * id and are deliberately omitted. `AuditLog` is NEVER scanned: its whole job is
 * to survive the account's removal.
 */
const HOD_REFERENCE_SURFACES: { collection: string; model: any; fields: string[] }[] = [
  { collection: 'notifications', model: Notification, fields: ['user'] },
  { collection: 'mentor_assignments', model: MentorAssignment, fields: ['assignedBy'] },
  { collection: 'system_settings', model: SystemSetting, fields: ['updatedBy'] },
  { collection: 'student_documents', model: StudentDocument, fields: ['uploadedBy', 'rejectedBy'] },
  { collection: 'achievements', model: Achievement, fields: ['verifiedBy', 'createdBy', 'updatedBy'] },
  { collection: 'placements', model: Placement, fields: ['createdBy', 'updatedBy'] },
  { collection: 'academic_edit_requests', model: AcademicEditRequest, fields: ['approvedBy', 'rejectedBy'] },
  { collection: 'student_edit_requests', model: StudentEditRequest, fields: ['reviewedBy'] },
  { collection: 'internal_marks', model: InternalMark, fields: ['updatedBy'] },
  { collection: 'mark_entry_permissions', model: MarkEntryPermission, fields: ['updatedBy'] },
  { collection: 'mark_update_requests', model: MarkUpdateRequest, fields: ['requestedBy', 'approvedBy', 'rejectedBy'] },
  { collection: 'counselling_records', model: CounsellingRecord, fields: ['evidence.addedBy'] },
  { collection: 'meetings', model: Meeting, fields: ['evidence.addedBy'] },
];

interface ReferenceHit {
  collection: string;
  count: number;
}

async function scanHodReferences(hodId: string): Promise<ReferenceHit[]> {
  const hits: ReferenceHit[] = [];
  for (const surface of HOD_REFERENCE_SURFACES) {
    const count = await surface.model.countDocuments({
      $or: surface.fields.map((f) => ({ [f]: hodId })),
    });
    if (count > 0) hits.push({ collection: surface.collection, count });
  }
  return hits;
}

/**
 * DELETE /api/admin/hods/:hodId
 *
 * PERMANENT deletion — the demo-cleanup safety valve, and the only User-delete
 * in this module. Every precondition is enforced server-side:
 *   - the caller is an Admin (`authorize(ROLES.ADMIN)` + `refuseUnlessAdmin`);
 *   - the target exists, is a real `role: 'HOD'` User (so Admin / Faculty /
 *     Student accounts can never be deleted through this route — they 404);
 *   - the target is NOT the calling Admin themselves;
 *   - the target is already INACTIVE (a deactivated account; active HODs 409);
 *   - the target is on the reviewed `VERIFIED_DEMO_HOD_IDS` allowlist
 *     (unverified / genuine HODs get 403 — they may only ever be deactivated);
 *   - a reference scan across every dependent collection is EMPTY. When any
 *     historical record still references the account, deletion is refused with
 *     409 so the account stays deactivated and keeps its records' author.
 *
 * The DELETE_HOD audit entry (target username / fullName / department, acting
 * admin, timestamp — NEVER the password hash or any secret) is written BEFORE
 * the user row is removed, and audit_logs.json is never touched, so history
 * survives the account.
 */
export async function deleteHod(req: AuthRequest, res: Response) {
  if (refuseUnlessAdmin(req, res)) return;

  const hodId = req.params.hodId as string;
  if (!isValidId(hodId)) return sendError(res, 'HOD account not found.', 404);

  try {
    const user = await User.findById(hodId);
    if (!user || user.role !== ROLES.HOD) {
      return sendError(res, 'HOD account not found.', 404);
    }
    if (req.user!.id && toIdString(req.user!.id) === toIdString(user._id)) {
      return sendError(res, 'The Admin account cannot be deleted through this endpoint.', 409);
    }
    if (user.isActive !== false) {
      return sendError(
        res,
        'Only an inactive (deactivated) HOD account can be permanently deleted. Deactivate this HOD first.',
        409
      );
    }
    if (!VERIFIED_DEMO_HOD_IDS.has(hodId)) {
      return sendError(
        res,
        'This HOD account is not on the verified demo-cleanup allowlist, so it cannot be permanently deleted. Keep it deactivated to preserve its history.',
        403
      );
    }

    const refs = await scanHodReferences(hodId);
    if (refs.length > 0) {
      const listed = refs.map((r) => `${r.collection} (${r.count})`).join(', ');
      return sendError(
        res,
        `Cannot permanently delete this HOD: it is still referenced by ${listed}. Keep the account deactivated so those historical records retain their HOD author.`,
        409
      );
    }

    const snapshot = {
      id: hodId,
      username: user.username || '',
      fullName: user.fullName || '',
      departmentId: toIdString(user.department) || '',
    };

    // Audit BEFORE removal so the entry is written even though the target user
    // row is about to disappear. Only non-sensitive identity is recorded.
    await logAudit({
      userId: req.user!.id,
      action: 'DELETE_HOD',
      entity: 'USER',
      entityId: hodId,
      details: {
        username: user.username,
        fullName: user.fullName,
        departmentId: toIdString(user.department) || '',
        reason: 'verified demo/test account cleanup',
      },
      req,
    });

    // Narrowest possible delete: this exact document, fetched above and proven
    // to be an inactive, allowlisted HOD with no dependent records. No broad
    // user-deletion query, no cascade.
    const result = await user.deleteOne();
    if (!result || result.deletedCount !== 1) {
      return sendError(res, 'HOD account could not be deleted.', 500);
    }

    return sendSuccess(
      res,
      snapshot,
      `HOD account "${user.fullName}" was permanently deleted. Historical audit records are retained.`
    );
  } catch (err: any) {
    console.error('deleteHod error:', err);
    return sendError(res, 'Failed to delete HOD account.', 500);
  }
}
