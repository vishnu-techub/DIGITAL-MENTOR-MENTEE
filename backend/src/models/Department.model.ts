import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export interface IDepartment extends LocalDocument {
  code: string;
  name: string;
  hodName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentSchema = new Schema<IDepartment>(
  {
    code: {
      type: String,
      required: [true, 'Department code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Department name is required'],
      trim: true,
    },
    hodName: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);



export const Department = defineModel<IDepartment>('Department', DepartmentSchema);
