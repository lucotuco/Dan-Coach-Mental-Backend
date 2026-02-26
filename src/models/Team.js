import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String, 
      required: true,
      trim: true },
    joinCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },
    type: { 
      type: String, 
      default: 'other',
      trim: true },
    ownerUserId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true },
  },
  { timestamps: true }
);

export const Team = mongoose.model('Team', teamSchema);