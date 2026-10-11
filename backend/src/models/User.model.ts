import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export type UserRole = 'ADMIN' | 'HOD' | 'FACULTY' | 'STUDENT' | 'PRINCIPAL';

export interface IUser extends LocalDocument {
  username: string;
  passwordHash: string;
  role: UserRole;
  email: string;
  fullName: string;
  department?: LocalId;
  isActive: boolean;
  lastLoginAt?: Date;
  /**
   * When true the account must set a new password before it can use any
   * protected route. Only ever set on first provisioning (Principal) and
   * cleared by a successful password change. Existing accounts leave it
   * undefined, which every check treats as false.
   */
  mustChangePassword?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },
    role: {
      type: String,
      enum: ['ADMIN', 'HOD', 'FACULTY', 'STUDENT', 'PRINCIPAL'],
      required: [true, 'Role is required'],
      index: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    department: {
      type: 'ObjectId',
      ref: 'Department',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastLoginAt: {
      type: Date,
    },
    /**
     * Defaults to false on insert. A document written before this field existed
     * simply has no value, which is read as false.
     */
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);



export const User = defineModel<IUser>('User', UserSchema);
