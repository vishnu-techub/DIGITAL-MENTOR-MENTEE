import { Response } from 'express';
import { AuditLog } from '../../models/index.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';

export async function getAuditLogs(req: AuthRequest, res: Response) {
  const { action, entity, limit = '100', page = '1' } = req.query as Record<string, string>;

  try {
    const filter: any = {};
    if (action) {
      filter.action = action;
    }
    if (entity) {
      filter.entity = entity;
    }

    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const pageNum = Math.max(1, parseInt(page, 10));
    const skip = (pageNum - 1) * limitNum;

    const logDocs = await AuditLog.find(filter)
      .populate('user')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const logs = logDocs.map((a: any) => {
      const user = a.user || {};
      return {
        id: a._id.toString(),
        _id: a._id.toString(),
        action: a.action,
        entity: a.entity,
        entity_id: a.entityId,
        details: a.details,
        ip_address: a.ipAddress,
        user_agent: a.userAgent,
        user_id: a.user?._id?.toString() || a.user?.toString() || '',
        user_name: a.userName || user.fullName || 'System',
        user_role: a.role || user.role || 'SYSTEM',
        username: user.username || '',
        created_at: a.createdAt,
      };
    });

    return sendSuccess(res, logs);
  } catch (err: any) {
    console.error('getAuditLogs error:', err);
    return sendError(res, 'Failed to fetch audit logs.', 500);
  }
}
