import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware.js';
import { sendError } from '../utils/response.js';
import { Role, ROLES } from '../config/constants.js';

export function authorize(...allowedRoles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 'Unauthenticated user.', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(
        res,
        'You are not authorized to perform this operation.',
        403
      );
    }

    next();
  };
}

export function enforceDepartmentScope(departmentIdExtractor: (req: AuthRequest) => string | undefined) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 'Unauthenticated user.', 401);
    }

    // Admin has global institutional scope
    if (req.user.role === ROLES.ADMIN) {
      return next();
    }

    // HOD is scoped to their department
    if (req.user.role === ROLES.HOD) {
      const targetDeptId = departmentIdExtractor(req);
      if (targetDeptId && targetDeptId !== req.user.departmentId) {
        return sendError(res, 'Access restricted: Department boundary violation.', 403);
      }
    }

    next();
  };
}
