import { Response } from 'express';
import mongoose from 'mongoose';
import {
  Department,
  Student,
  Faculty,
  MentorAssignment,
  Meeting,
  CounsellingRecord,
  AcademicRecord,
} from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { ROLES } from '../../config/constants.js';
import { calculateArrearStatistics } from '../../utils/arrears.util.js';

export async function getDepartmentReport(req: AuthRequest, res: Response) {
  try {
    const filter: any = {};
    if (req.user?.role === ROLES.HOD && req.user.departmentId) {
      if (mongoose.Types.ObjectId.isValid(req.user.departmentId)) {
        filter._id = req.user.departmentId;
      }
    }

    const depts = await Department.find(filter).sort({ code: 1 });

    const departments = await Promise.all(
      depts.map(async (d) => {
        const totalStudents = await Student.countDocuments({ department: d._id, isActive: true });
        const totalFaculty = await Faculty.countDocuments({ department: d._id, isActive: true });

        // Assigned students (distinct student IDs with active assignments in this department)
        const activeAssignedStudents = await MentorAssignment.distinct('student', {
          department: d._id,
          status: 'ACTIVE',
        });

        // Find students in this department to count their meetings and counselling
        const deptStudentIds = await Student.find({ department: d._id }).distinct('_id');

        const completedMeetings = await Meeting.countDocuments({
          student: { $in: deptStudentIds },
          meetingStatus: 'COMPLETED',
        });

        const totalCounsellingSessions = await CounsellingRecord.countDocuments({
          student: { $in: deptStudentIds },
        });

        return {
          id: d._id.toString(),
          _id: d._id.toString(),
          code: d.code,
          name: d.name,
          total_students: totalStudents,
          total_faculty: totalFaculty,
          assigned_students: activeAssignedStudents.length,
          completed_meetings: completedMeetings,
          total_counselling_sessions: totalCounsellingSessions,
        };
      })
    );

    // Counselling category breakdown
    const categoryStatsRaw = await CounsellingRecord.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          category: '$_id',
          count: 1,
          _id: 0,
        },
      },
    ]);

    return sendSuccess(res, {
      departments,
      counsellingByCategory: categoryStatsRaw,
    });
  } catch (err: any) {
    console.error('getDepartmentReport error:', err);
    return sendError(res, 'Failed to generate institutional report.', 500);
  }
}

export async function exportStudentsCsv(req: AuthRequest, res: Response) {
  try {
    const filter: any = { isActive: true };

    if (req.user?.role === ROLES.HOD && req.user.departmentId) {
      if (mongoose.Types.ObjectId.isValid(req.user.departmentId)) {
        filter.department = req.user.departmentId;
      }
    }

    const students = await Student.find(filter)
      .populate('department')
      .populate('batch')
      .sort({ registerNumber: 1 });

    const rows = await Promise.all(
      students.map(async (s: any) => {
        const dept = s.department || {};
        const batch = s.batch || {};

        // Active mentor
        const activeAsg = await MentorAssignment.findOne({
          student: s._id,
          status: 'ACTIVE',
        }).populate({ path: 'mentor', populate: { path: 'user' } });

        const mentorUser = (activeAsg?.mentor as any)?.user;
        const mentorName = mentorUser?.fullName || 'Unassigned';

        // Arrears count (Historical vs Active)
        const academicRecords = await AcademicRecord.find({ student: s._id });
        const arrearStats = calculateArrearStatistics(academicRecords, s.clearedSubjects || []);

        // Meetings count
        const completedMeetings = await Meeting.countDocuments({
          student: s._id,
          meetingStatus: 'COMPLETED',
        });

        return [
          `"${s.registerNumber}"`,
          `"${s.fullName}"`,
          `"${dept.code || ''}"`,
          `"${batch.name || ''}"`,
          `"${s.residentialType || 'DAY_SCHOLAR'}"`,
          `"${s.mobileNumber || ''}"`,
          `"${s.email || ''}"`,
          `"${mentorName}"`,
          arrearStats.activeArrearsCount,
          arrearStats.historicalArrearsCount,
          completedMeetings,
        ];
      })
    );

    const headers = [
      'Register Number',
      'Student Name',
      'Department',
      'Batch',
      'Residential Type',
      'Mobile',
      'Email',
      'Active Mentor',
      'Active Arrears',
      'Historical Arrears',
      'Completed Saturday Meetings',
    ];

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="KSRCE_Mentee_Roster.csv"');
    return res.send(csvContent);
  } catch (err: any) {
    console.error('exportStudentsCsv error:', err);
    return sendError(res, 'Failed to export CSV.', 500);
  }
}
