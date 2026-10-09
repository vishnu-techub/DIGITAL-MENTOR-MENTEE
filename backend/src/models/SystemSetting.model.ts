import { defineModel, getModel, Schema, LocalId, type LocalDocument } from '../services/localModel.js';

export interface ISystemSetting extends LocalDocument {
  key: string;
  value: string;
  description?: string;
  updatedBy?: LocalId;
  createdAt: Date;
  updatedAt: Date;
}

const SystemSettingSchema = new Schema<ISystemSetting>(
  {
    key: {
      type: String,
      required: [true, 'Setting key is required'],
      unique: true,
      trim: true,
      index: true,
    },
    value: {
      type: String,
      required: [true, 'Setting value is required'],
    },
    description: {
      type: String,
      trim: true,
    },
    updatedBy: {
      type: 'ObjectId',
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);



export const SystemSetting = defineModel<ISystemSetting>('SystemSetting', SystemSettingSchema);
