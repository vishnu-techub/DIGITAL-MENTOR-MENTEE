import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export interface IFaculty extends LocalDocument {
  user: LocalId;
  employeeId: string;
  department: LocalId;
  designation: string;
  cabinLocation: string;
  phoneNumber?: string;
  maxMentees: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FacultySchema = new Schema<IFaculty>(
  {
    user: {
      type: 'ObjectId',
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    employeeId: {
      type: String,
      required: [true, 'Employee ID is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    department: {
      type: 'ObjectId',
      ref: 'Department',
      required: true,
      index: true,
    },
    designation: {
      type: String,
      required: [true, 'Designation is required'],
      trim: true,
      default: 'Assistant Professor',
    },
    cabinLocation: {
      type: String,
      trim: true,
      default: 'Faculty Cabin',
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    maxMentees: {
      type: Number,
      default: 25,
      min: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);



export const Faculty = defineModel<IFaculty>('Faculty', FacultySchema);
