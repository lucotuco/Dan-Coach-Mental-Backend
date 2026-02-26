import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    email: { type: String, required: true, unique: true, lowercase: true, trim: true },

    password: { type: String, required: true },

    birthDate: { type: Date, required: false },

    // OJO: role (no "rol")
    role: { type: String, enum: ['coach', 'member'], default: 'member', required: true },

    // 1 equipo por usuario
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);