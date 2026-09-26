import { Request } from 'express';
import { AuditLog, User } from '../models/index.js';

export interface AuditParams {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, any> | string;
  req?: Request;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const ipAddress = params.req?.ip || params.req?.socket?.remoteAddress || undefined;
    const userAgent = params.req?.headers['user-agent'] || undefined;

    let userName: string | undefined;
    let role: string | undefined;

    if (params.userId) {
      try {
        const u = await User.findById(params.userId).select('fullName role');
        if (u) {
          userName = u.fullName;
          role = u.role;
        }
      } catch (_) {}
    }

    await AuditLog.create({
      user: params.userId || undefined,
      userName,
      role,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId || undefined,
      details: params.details,
      ipAddress,
      userAgent,
      createdAt: new Date(),
    });
  } catch (err: any) {
    console.error('Audit logging error:', err.message);
  }
}
