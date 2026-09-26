import mongoose, { Schema, Document } from 'mongoose';

export interface IFaculty extends Document {
  user: mongoose.Types.ObjectId;
  employeeId: string;
  department: mongoose.Types.ObjectId;
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
      type: Schema.Types.ObjectId,
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
      type: Schema.Types.ObjectId,
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



export const Faculty = mongoose.model<IFaculty>('Faculty', FacultySchema);
