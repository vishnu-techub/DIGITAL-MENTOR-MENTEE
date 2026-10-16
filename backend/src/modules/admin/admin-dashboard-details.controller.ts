import { Response } from 'express';
import {
  Student,
  Faculty,
  User,
  AcademicRecord,
  CounsellingRecord,
  StudentDocument,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { calculateArrearStatistics } from '../../utils/arrears.util.js';

/**
 * ADMIN DASHBOARD — STATISTICS DETAIL VIEWS
 * ---------------------------------------------------------------------------
 * The seven Admin overview cards are college-wide aggregates. Clicking a card
 * must reveal the real records behind the number, without pulling the whole
 * college into the browser.
 *
 * Four of the seven aggregates already have a paginated list endpoint and are
 * NOT re-implemented here:
 *   - Total Students      → `GET /api/students`
 *   - Assigned Mentees    → `GET /api/students?assignmentStatus=assigned`
 *   - Unassigned Students → `GET /api/students?assignmentStatus=unassigned`
 *   - Total Faculty       → `GET /api/admin/faculty`
 *
 * The remaining three aggregates have no college-wide list anywhere else
 * (mentoring records and documents are only reachable per student), so building
 * them would require an N+1 fetch of every student. These handlers exist to
 * serve exactly those three, paginated and searchable.
 *
 * Every aggregate here is derived with the SAME rule the dashboard card uses,
 * so the detail totals reconcile with the card:
 *   - Active Arrears      → calculateArrearStatistics(...).activeArrearsCount
 *                           summed over active students (see getAdminDashboardStats)
 *   - Mentoring Sessions  → CounsellingRecord.countDocuments()
 *   - Uploaded Documents  → StudentDocument.countDocuments()
 *
 * Each route is mounted behind `authorize(ROLES.ADMIN)`; these handlers add no
 * extra authorisation because the mount is the single gate, exactly like every
 * other admin route.
 */

/** Escape a user string so it is safe to embed in a RegExp filter. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parse `page`/`limit` query values into safe, bounded numbers. */
function parsePaging(page: string | undefined, limit: string | undefined, defaultLimit: number) {
  const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
  const rawLimit = parseInt(limit || String(defaultLimit), 10);
  const limitNum = Math.min(100, Math.max(1, Number.isNaN(rawLimit) ? defaultLimit : rawLimit));
  return { pageNum, limitNum, skip: (pageNum - 1) * limitNum };
}

/**
 * GET /api/admin/dashboard-details/active-arrears
 * Query: search, page, limit
 *
 * Lists students who currently carry at least one active arrear, with the
 * subject + semester detail for each. The count rule is identical to the
 * "Active Arrears" card, so `totalActiveArrears` (unfiltered) equals the card
 * value and every row is a genuine active arrear.
 */
export async function getActiveArrearsDetails(req: AuthRequest, res: Response) {
  try {
    const { search = '', page, limit } = req.query as Record<string, string>;
    const { pageNum, limitNum } = parsePaging(page, limit, 25);

    const filter: any = { isActive: true };
    if (search.trim()) {
      const rx = new RegExp(escapeRegExp(search.trim()), 'i');
      filter.$or = [{ fullName: rx }, { registerNumber: rx }];
    }

    // Only ACTIVE students can carry an active arrear, matching the card.
    const students = await Student.find(filter)
      .select('_id registerNumber fullName department batch section clearedSubjects arrearHistory')
      .populate('department', 'name code')
      .populate('batch', 'name');

    const studentIds = (students as any[]).map((s) => s._id);
    const records = studentIds.length
      ? await AcademicRecord.find({ student: { $in: studentIds } })
          .select('student semesterNumber cgpa sgpa arrearsCount arrearsSubjects arrearSubjectDetails clearedSubjects')
          .lean()
      : [];

    const recordsByStudent = new Map<string, any[]>();
    for (const rec of records as any[]) {
      const key = String(rec.student);
      if (!recordsByStudent.has(key)) recordsByStudent.set(key, []);
      recordsByStudent.get(key)!.push(rec);
    }

    const rows: any[] = [];
    let totalActiveArrears = 0;

    for (const s of students as any[]) {
      const stats = calculateArrearStatistics(
        recordsByStudent.get(String(s._id)) || [],
        s.clearedSubjects || [],
        s.arrearHistory || []
      );
      if (stats.activeArrearsCount <= 0) continue;

      totalActiveArrears += stats.activeArrearsCount;
      const dept: any = s.department || {};
      const batch: any = s.batch || {};

      rows.push({
        id: s._id.toString(),
        student_id: s._id.toString(),
        register_number: s.registerNumber || '',
        full_name: s.fullName || '',
        department_code: dept.code || '',
        department_name: dept.name || '',
        batch_name: batch.name || '',
        section: s.section || '',
        active_arrears: stats.activeArrearsCount,
        arrear_status_label: stats.statusLabel,
        // Sorted newest semester first so the most recent paper reads first.
        subjects: (stats.activeArrearDetails || [])
          .slice()
          .sort((a: any, b: any) => (b.semester || 0) - (a.semester || 0))
          .map((d: any) => ({
            semester: d.semester ?? null,
            subject_code: d.subjectCode || '',
            subject_name: d.subjectName || '',
          })),
      });
    }

    // Most arrears first (the actionable rows), then register number for a
    // stable order.
    rows.sort(
      (a, b) =>
        b.active_arrears - a.active_arrears ||
        String(a.register_number).localeCompare(String(b.register_number))
    );

    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / limitNum));
    const start = (pageNum - 1) * limitNum;
    const pageRows = rows.slice(start, start + limitNum);

    return sendSuccess(res, {
      students: pageRows,
      total,
      totalActiveArrears,
      page: pageNum,
      limit: limitNum,
      pages,
      hasMore: pageNum < pages,
    });
  } catch (err: any) {
    console.error('getActiveArrearsDetails error:', err);
    return sendError(res, 'Failed to fetch active arrears details.', 500);
  }
}

/**
 * GET /api/admin/dashboard-details/mentoring-sessions
 * Query: search, page, limit
 *
 * Lists college-wide mentoring records (CounsellingRecord). `total` equals
 * `CounsellingRecord.countDocuments()` for the same filter, matching the
 * "Mentoring Sessions" card when no search is applied.
 */
export async function getMentoringSessionsDetails(req: AuthRequest, res: Response) {
  try {
    const { search = '', page, limit } = req.query as Record<string, string>;
    const { pageNum, limitNum, skip } = parsePaging(page, limit, 25);

    const filter: any = {};
    if (search.trim()) {
      const rx = new RegExp(escapeRegExp(search.trim()), 'i');
      // Resolve name/register matches to ids first: a record stores refs, not
      // the names, so the search cannot run directly on the record document.
      const [matchedStudents, matchedUsers] = await Promise.all([
        Student.find({ $or: [{ fullName: rx }, { registerNumber: rx }] }).select('_id'),
        User.find({ fullName: rx }).select('_id'),
      ]);
      const matchedFaculty = matchedUsers.length
        ? await Faculty.find({ user: { $in: matchedUsers.map((u: any) => u._id) } }).select('_id')
        : [];

      filter.$or = [
        { student: { $in: matchedStudents.map((s: any) => s._id) } },
        { mentor: { $in: matchedFaculty.map((f: any) => f._id) } },
        { category: rx },
        { recordKind: rx },
      ];
    }

    const [records, total] = await Promise.all([
      CounsellingRecord.find(filter)
        .populate('student', 'fullName registerNumber')
        .populate({ path: 'mentor', populate: { path: 'user', select: 'fullName' } })
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      CounsellingRecord.countDocuments(filter),
    ]);

    const rows = (records as any[]).map((rec) => {
      const student: any = rec.student || {};
      const mentor: any = rec.mentor || {};
      const mentorUser: any = mentor.user || {};
      return {
        id: rec._id.toString(),
        student_id: student._id ? student._id.toString() : String(rec.studentId || ''),
        student_name: student.fullName || '',
        register_number: student.registerNumber || '',
        mentor_name: mentorUser.fullName || '',
        date: rec.date || rec.sessionDate || '',
        categories: Array.isArray(rec.categories) ? rec.categories : [],
        record_kind: rec.recordKind || 'INDIVIDUAL',
        discussion_with: Array.isArray(rec.discussionWith) ? rec.discussionWith : [],
        status: rec.status || '',
      };
    });

    const pages = Math.max(1, Math.ceil(total / limitNum));
    return sendSuccess(res, {
      records: rows,
      total,
      page: pageNum,
      limit: limitNum,
      pages,
      hasMore: pageNum < pages,
    });
  } catch (err: any) {
    console.error('getMentoringSessionsDetails error:', err);
    return sendError(res, 'Failed to fetch mentoring sessions.', 500);
  }
}

/**
 * GET /api/admin/dashboard-details/documents
 * Query: search, verificationStatus, page, limit
 *
 * Lists college-wide uploaded student documents. `total` equals
 * `StudentDocument.countDocuments()` for the same filter, matching the
 * "Uploaded Documents" card when no filter is applied.
 */
export async function getUploadedDocumentsDetails(req: AuthRequest, res: Response) {
  try {
    const { search = '', verificationStatus = '', page, limit } = req.query as Record<string, string>;
    const { pageNum, limitNum, skip } = parsePaging(page, limit, 25);

    const filter: any = {};
    if (verificationStatus.trim()) filter.verificationStatus = verificationStatus.trim();

    if (search.trim()) {
      const rx = new RegExp(escapeRegExp(search.trim()), 'i');
      const matchedStudents = await Student.find({
        $or: [{ fullName: rx }, { registerNumber: rx }],
      }).select('_id');

      filter.$or = [
        { studentId: { $in: matchedStudents.map((s: any) => s._id) } },
        { title: rx },
        { fileName: rx },
        { category: rx },
      ];
    }

    const [documents, total] = await Promise.all([
      StudentDocument.find(filter)
        .populate('studentId', 'fullName registerNumber')
        .sort({ uploadedAt: -1 })
        .skip(skip)
        .limit(limitNum),
      StudentDocument.countDocuments(filter),
    ]);

    const rows = (documents as any[]).map((doc) => {
      const student: any = doc.studentId || {};
      return {
        id: doc._id.toString(),
        student_id: student._id ? student._id.toString() : String(doc.studentId || ''),
        student_name: student.fullName || '',
        register_number: student.registerNumber || '',
        title: doc.title || doc.fileName || 'Document',
        category: doc.category || 'Other',
        document_type: doc.documentType || '',
        file_name: doc.fileName || '',
        file_type: doc.fileType || '',
        verification_status: doc.verificationStatus || 'Pending',
        uploaded_at: doc.uploadedAt || doc.createdAt || null,
        watermarked: !!doc.watermarkedFileUrl,
      };
    });

    const pages = Math.max(1, Math.ceil(total / limitNum));
    return sendSuccess(res, {
      documents: rows,
      total,
      page: pageNum,
      limit: limitNum,
      pages,
      hasMore: pageNum < pages,
    });
  } catch (err: any) {
    console.error('getUploadedDocumentsDetails error:', err);
    return sendError(res, 'Failed to fetch uploaded documents.', 500);
  }
}
