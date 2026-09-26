import mongoose, { Schema, Document } from 'mongoose';

export type NotificationType =
  | 'MEETING_REMINDER'
  | 'MEETING_PENDING'
  | 'PROFILE_COMPLETION'
  | 'REASSIGNMENT'
  | 'GENERAL'
  | 'MENTOR_ASSIGNMENT'
  | 'SYSTEM_ANNOUNCEMENT'
  | 'MEETING_REMINDER_FRIDAY'
  | 'MEETING_TODAY_SATURDAY';

export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  title: string;
  message: string;
  type: NotificationType | string;
  isRead: boolean;
  relatedEntity?: string;
  relatedEntityId?: string;
  actionUrl?: string;
  scheduledFor?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      default: 'GENERAL',
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    relatedEntity: {
      type: String,
    },
    relatedEntityId: {
      type: String,
    },
    actionUrl: {
      type: String,
    },
    scheduledFor: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
NotificationSchema.index({ user: 1, isRead: 1 });
NotificationSchema.index({ createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
