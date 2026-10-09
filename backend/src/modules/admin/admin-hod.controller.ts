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
 *     the department for a successor (deactivate is the only removal path —
 *     nothing here ever deletes a User, so historical mentoring and academic
 *     records keep their author);
 *   - role is always written as 'HOD' and can never be changed through these
 *     endpoints;
 *   - department isolation of the verified `/api/hod/*` surface is untouched:
 *     this file does not read or write any mentoring record.
 */
import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { User, Department } from '../../models/index.js';
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

export interface HodRow {
  id: string;
  username: string;
  full_name: string;
  email: string;
  department_id: string;
  department_name: string;
  department_code: string;
  is_active: 0 | 1;
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
