import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    birthDate: {
      type: Date,
      required: false,
    },
    sport: {
      type: String,
      required: false,
    },
    competitionType: {
      type: String,
      enum: ['individual', 'pareja', 'equipo'],
      required: false,
    },
    level: {
      type: String,
      required: false,
    },
    goals: {
      url: { type: String },
      transcript: { type: String },
      summary: { type: String },
      tags: [{ type: String }],
      durationSeconds: { type: Number },
    },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
