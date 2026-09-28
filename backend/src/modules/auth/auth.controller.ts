import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, Student, Faculty, Department, Batch } from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { JWT_SECRET, AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../middleware/audit.middleware.js';

export async function login(req: Request, res: Response) {
  const { username, password } = req.body;

  if (!username || !password) {
    return sendError(res, 'Username and password are required.', 400);
  }

  try {
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    // 1. Direct match by username or email
    let user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { email: { $regex: new RegExp(`^${cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
      ],
    }).populate('department');

    // 2. If 'admin' or 'administrator', find admin user
    if (!user && (cleanUsername.toLowerCase() === 'admin' || cleanUsername.toLowerCase() === 'administrator')) {
      user = await User.findOne({ role: 'ADMIN' }).populate('department');
    }

    // 3. If student register number was entered
    if (!user) {
      const studentDoc = await Student.findOne({
        registerNumber: { $regex: new RegExp(`^${cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      });
      if (studentDoc && studentDoc.user) {
        user = await User.findById(studentDoc.user).populate('department');
      }
    }

    if (!user) {
      return sendError(res, 'Invalid username or password.', 401);
    }

    if (!user.isActive) {
      return sendError(res, 'Your institutional account has been deactivated. Please contact administrator.', 403);
    }

    // Secure bcrypt verification against stored password hash
    const isMatch = await bcrypt.compare(cleanPassword, user.passwordHash);
    if (!isMatch) {
      return sendError(res, 'Invalid username or password.', 401);
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    let facultyId: string | null = null;
    let studentId: string | null = null;
    let profileCompleted = false;

    if (user.role === 'FACULTY' || user.role === 'HOD') {
      const fac = await Faculty.findOne({ user: user._id });
      if (fac) facultyId = fac._id.toString();
    } else if (user.role === 'STUDENT') {
      const stu = await Student.findOne({ user: user._id });
      if (stu) {
        studentId = stu._id.toString();
        profileCompleted = stu.profileCompleted === true;
      }
    }

    const tokenPayload = {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      email: user.email,
      fullName: user.fullName,
      departmentId: user.department ? user.department._id.toString() : null,
      facultyId,
      studentId,
      profileCompleted,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '30d' });

    await logAudit({
      userId: user._id.toString(),
      action: 'LOGIN',
      entity: 'USER',
      entityId: user._id.toString(),
      details: { role: user.role, username: user.username },
      req,
    });

    return sendSuccess(
      res,
      {
        token,
        user: tokenPayload,
      },
      'Authentication successful.'
    );
  } catch (err: any) {
    console.error('Login error:', err);
    return sendError(res, 'Internal server error during authentication.', 500);
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  if (!req.user) {
    return sendError(res, 'Unauthenticated user.', 401);
  }

  try {
    const user = await User.findById(req.user.id).populate('department');

    if (!user) {
      return sendError(res, 'User record not found.', 404);
    }

    let extraDetails: any = {};
    if (user.role === 'FACULTY' || user.role === 'HOD') {
      const fac = await Faculty.findOne({ user: user._id }).populate('department');
      extraDetails.faculty = fac;
      extraDetails.facultyId = fac?._id.toString();
    } else if (user.role === 'STUDENT') {
      const stu = await Student.findOne({ user: user._id }).populate('department batch');
      extraDetails.student = stu;
      extraDetails.studentId = stu?._id.toString();
      extraDetails.profileCompleted = stu?.profileCompleted === true;
    }

    const deptAny = user.department as any;

    return sendSuccess(res, {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      email: user.email,
      fullName: user.fullName,
      departmentId: deptAny?._id?.toString() || null,
      dept_name: deptAny?.name || null,
      dept_code: deptAny?.code || null,
      isActive: user.isActive,
      ...extraDetails,
    });
  } catch (err: any) {
    console.error('getMe error:', err);
    return sendError(res, 'Failed to fetch user profile.', 500);
  }
}

export async function changePassword(req: AuthRequest, res: Response) {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return sendError(res, 'Current password and new password are required.', 400);
  }

  if (newPassword.length < 6) {
    return sendError(res, 'New password must be at least 6 characters long.', 400);
  }

  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      return sendError(res, 'User record not found.', 404);
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return sendError(res, 'Current password provided is incorrect.', 400);
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    await logAudit({
      userId: user._id.toString(),
      action: 'CHANGE_PASSWORD',
      entity: 'USER',
      entityId: user._id.toString(),
      req,
    });

    return sendSuccess(res, null, 'Password updated successfully.');
  } catch (err: any) {
    console.error('changePassword error:', err);
    return sendError(res, 'Failed to change password.', 500);
  }
}
