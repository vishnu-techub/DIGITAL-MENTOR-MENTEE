import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export interface IBatch extends LocalDocument {
  name: string;
  startYear: number;
  endYear: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BatchSchema = new Schema<IBatch>(
  {
    name: {
      type: String,
      required: [true, 'Batch name is required'],
      unique: true,
      trim: true,
      index: true,
    },
    startYear: {
      type: Number,
      required: [true, 'Start year is required'],
    },
    endYear: {
      type: Number,
      required: [true, 'End year is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);



export const Batch = defineModel<IBatch>('Batch', BatchSchema);
