import { Response } from 'express';
import { Department, Batch, Student, Faculty } from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';

/**
 * ============================================================================
 * /api/reference — non-admin-safe lookup lists
 * ============================================================================
 *
 * WHY THIS EXISTS
 *
 * Every authenticated user needs the department and batch lists to fill in
 * identity forms and dropdowns (a Student completing an institutional identity
 * request, a Faculty member picking a batch, an HOD filtering a roster).
 *
 * Previously those dropdowns called `GET /api/admin/departments` and
 * `GET /api/admin/batches`, so the only way to serve them was to leave those
 * ADMIN routes open to every logged-in role — an Admin surface reachable by a
 * Student account. The Admin routes are now correctly ADMIN-only; this module
 * provides the minimal, deliberately non-sensitive fields for dropdowns
 * instead.
 *
 * WHAT IS DELIBERATELY NOT EXPOSED
 * Only `_id`, `name`, `code` and the academic year range. No mentoring records,
 * no faculty personal data, no emails, no performance figures. Anything that is
 * actual Admin functionality (create department, create batch, system settings)
 * stays behind `authorize(ROLES.ADMIN)` in the admin module.
 */

export async function getReferenceDepartments(req: AuthRequest, res: Response): Promise<any> {
  try {
    const departments = await Department.find().sort({ code: 1 }).lean();
    return sendSuccess(
      res,
      (departments as any[]).map((d) => ({
        id: String(d._id),
        _id: String(d._id),
        code: d.code,
        name: d.name,
      }))
    );
  } catch (err: any) {
    console.error('getReferenceDepartments error:', err);
    return sendError(res, 'Failed to fetch departments.', 500);
  }
}

export async function getReferenceBatches(req: AuthRequest, res: Response): Promise<any> {
  try {
    const batches = await Batch.find().sort({ startYear: -1 }).lean();
    return sendSuccess(
      res,
      (batches as any[]).map((b) => ({
        id: String(b._id),
        _id: String(b._id),
        name: b.name,
        start_year: b.startYear ?? null,
        end_year: b.endYear ?? null,
        is_active: b.isActive ? 1 : 0,
      }))
    );
  } catch (err: any) {
    console.error('getReferenceBatches error:', err);
    return sendError(res, 'Failed to fetch batches.', 500);
  }
}

/**
 * Public-to-authenticated counts used by the Admin identity screens only.
 * Kept in this module (not the admin one) because the counts are already
 * implied by the two lists above, and Admin-specific aggregates belong in the
 * Admin dashboard.
 */
export async function getReferenceCounts(req: AuthRequest, res: Response): Promise<any> {
  try {
    const [departments, batches] = await Promise.all([
      Department.find().sort({ code: 1 }).lean(),
      Batch.find().sort({ startYear: -1 }).lean(),
    ]);

    const studentCount = await Student.countDocuments({ isActive: true });
    const facultyCount = await Faculty.countDocuments({ isActive: true });

    return sendSuccess(res, {
      departments: (departments as any[]).length,
      batches: (batches as any[]).length,
      students: studentCount,
      faculty: facultyCount,
    });
  } catch (err: any) {
    console.error('getReferenceCounts error:', err);
    return sendError(res, 'Failed to fetch reference counts.', 500);
  }
}