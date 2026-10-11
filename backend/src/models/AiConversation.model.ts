import { defineModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export type AiMessageRole = 'user' | 'assistant' | 'system';

export interface IAiChatMessage {
  role: AiMessageRole;
  content: string;
  createdAt: Date;
}

/**
 * AI assistant conversation transcript.
 *
 * One record per chat thread, owned by exactly one authenticated user. The
 * `role` is captured at creation so a transcript never silently changes scope
 * if the same account is later reassigned. Conversations are only ever
 * fetched/deleted by their owner — every controller enforces ownership before
 * read/write. Transcripts deliberately hold the minimal information needed to
 * carry a multi-turn conversation; uploaded documents, marks and counselling
 * records are NEVER written into these messages.
 */
export interface IAiConversation extends LocalDocument {
  user: LocalId;
  role: 'ADMIN' | 'PRINCIPAL' | 'HOD' | 'FACULTY' | 'STUDENT';
  title: string;
  messages: IAiChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const AiConversationSchema = new Schema<IAiConversation>(
  {
    user: {
      type: 'ObjectId',
      ref: 'User',
      required: [true, 'Conversation owner is required'],
      index: true,
    },
    role: {
      type: String,
      required: [true, 'Role at creation is required'],
      enum: ['ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY', 'STUDENT'],
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: 'New conversation',
      maxlength: 120,
    },
    messages: {
      type: [
        {
          role: {
            type: String,
            enum: ['user', 'assistant', 'system'],
            default: 'user',
          },
          content: { type: String, required: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: () => [],
    },
  },
  {
    timestamps: true,
    collection: 'ai_conversations',
  }
);

// Owner-scoped index: listing is always "my conversations, most recent first".
AiConversationSchema.index({ user: 1, updatedAt: -1 });

export const AiConversation = defineModel<IAiConversation>('AiConversation', AiConversationSchema);