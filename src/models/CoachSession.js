// src/models/CoachSession.js
import mongoose from 'mongoose';

const CoachSessionSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    fecha: {
      type: Date,
      default: Date.now,
    },
    canal: {
      type: String,
      enum: ['realtime', 'chat'],
      default: 'realtime',
    },
    resumen: {
      type: String,
      required: true,
    },
    puntosClave: [String], // hasta 3 bullets
    proximoPaso: {
      type: String,
    },
    modelo: {
      type: String,
    },
  },
  { timestamps: true }
);

export const CoachSession = mongoose.model('CoachSession', CoachSessionSchema);
