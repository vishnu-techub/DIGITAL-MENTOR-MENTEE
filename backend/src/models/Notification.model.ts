import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export type NotificationType =
  | 'MEETING_REMINDER'
  | 'MEETING_PENDING'
  | 'PROFILE_COMPLETION'
  | 'REASSIGNMENT'
  | 'GENERAL'
  | 'MENTOR_ASSIGNMENT'
  | 'SYSTEM_ANNOUNCEMENT'
  | 'MEETING_REMINDER_FRIDAY'
  | 'MEETING_TODAY_SATURDAY'
  | 'FACULTY_NOTIFICATION';

export interface INotification extends LocalDocument {
  user: LocalId;
  title: string;
  message: string;
  type: NotificationType | string;
  isRead: boolean;
  relatedEntity?: string;
  relatedEntityId?: string;
  actionUrl?: string;
  scheduledFor?: Date;
  /**
   * Faculty -> HOD notices only. The department is stamped server-side from the
   * sender's own Faculty record, never from the request body, and it is the
   * field every department-scoped read filters on. Every other notification
   * type leaves it undefined.
   */
  department?: LocalId;
  /** Faculty record id of the sender (denormalised so the sent list needs no join). */
  facultyId?: string;
  /** Sender display name at send time. */
  facultyName?: string;
  /**
   * Why this particular copy exists. One logical send produces one document per
   * recipient, so the author's "sent" list filters to the HOD copies instead of
   * listing the same notice once for every recipient.
   */
  recipientRole?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    user: {
      type: 'ObjectId',
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
    department: {
      type: 'ObjectId',
      ref: 'Department',
      index: true,
    },
    facultyId: {
      type: String,
      index: true,
    },
    facultyName: {
      type: String,
    },
    recipientRole: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
NotificationSchema.index({ user: 1, isRead: 1 });
NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ department: 1, isRead: 1 });

export const Notification = defineModel<INotification>('Notification', NotificationSchema);
