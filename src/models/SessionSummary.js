import mongoose from 'mongoose';

const sessionSummarySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    contexto: {
      type: String,
      default: '',
    },
    tema_principal: {
      type: String,
      default: '',
    },
    problema_clave: {
      type: String,
      default: '',
    },
    hipotesis: {
      type: String,
      default: '',
    },
    plan_accion: {
      type: [String],
      default: [],
    },
    acuerdos_tareas: {
      type: [String],
      default: [],
    },
    seguimiento_proximo: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5,
    },
  },
  { timestamps: true }
);

sessionSummarySchema.index({ userId: 1, date: -1 });

export const SessionSummary = mongoose.model(
  'SessionSummary',
  sessionSummarySchema
);
