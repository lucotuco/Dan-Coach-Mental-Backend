import mongoose from 'mongoose';

const userProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    sport: {
      type: String,
    },
    role: {
      type: String,
    },
    level: {
      type: String,
    },
    goals: {
      type: [String],
      default: [],
    },
    competitionContext: {
      type: String,
    },
    preferences: {
      type: [String],
      default: [],
    },
    restrictions: {
      type: [String],
      default: [],
    },
    stableFacts: {
      type: [String],
      default: [],
    },
    historyNotes: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

export const UserProfile = mongoose.model('UserProfile', userProfileSchema);
