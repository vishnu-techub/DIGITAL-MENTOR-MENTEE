import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { sendError } from '../utils/response.js';
import { Role } from '../config/constants.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'ksrce-mentoring-jwt-secret-key-2026';

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  email: string;
  fullName: string;
  departmentId: string | null;
  facultyId?: string | null;
  studentId?: string | null;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'Authentication token missing or invalid.', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (err: any) {
    return sendError(res, 'Session expired or invalid authentication token.', 401);
  }
}

export function optionalAuthenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
  } catch {
    // Proceed without user attached if token is invalid or expired
  }
  next();
}
