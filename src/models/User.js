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
    phone:{
      type: Number,
      require: false,
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
    goalA: {
      url: { type: String },
      transcript: { type: String },
      summary: { type: String },
      tags: [{ type: String }],
      durationSeconds: { type: Number },
    },
    goalT:{
      type: String,
      required: false,
    }
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
