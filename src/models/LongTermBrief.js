import mongoose from 'mongoose';

const longTermBriefSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    text: { type: String, required: true },
    sourceSessionIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const LongTermBrief = mongoose.model('LongTermBrief', longTermBriefSchema);
