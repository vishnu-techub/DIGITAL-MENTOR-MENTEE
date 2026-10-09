import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export interface IAuditLog extends LocalDocument {
  user?: LocalId;
  userName?: string;
  role?: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    user: {
      type: 'ObjectId',
      ref: 'User',
      index: true,
    },
    userName: {
      type: String,
    },
    role: {
      type: String,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    entity: {
      type: String,
      required: true,
      index: true,
    },
    entityId: {
      type: String,
    },
    details: {
      type: 'Mixed',
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

// Index
AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = defineModel<IAuditLog>('AuditLog', AuditLogSchema);
