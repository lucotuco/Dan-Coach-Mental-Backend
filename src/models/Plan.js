import mongoose from 'mongoose';

const AXES = [
  'confianza',
  'disciplina',
  'persistencia',
  'concentracion',
  'vinculacion',
  'regulacionEmocional',
  'superacion',
  'liderazgo',
];

const planItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true }, // string estable
    axis: { type: String, required: true, enum: AXES },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    done: { type: Boolean, default: false },
    // opcional: si querés “sugerencia” de día/orden sin imponer
    dayHint: { type: Number, min: 0, max: 6, default: null }, // 0=lunes
  },
  { _id: false }
);

const weeklyPlanSchema = new mongoose.Schema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weekStart: { type: Date, required: true, index: true },

    generatedFromCheckinId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Checkin',
      required: true,
    },

    focusAxes: { type: [String], required: true, enum: AXES },

    items: { type: [planItemSchema], required: true },

    status: { type: String, enum: ['active', 'completed'], default: 'active' },

    // snapshot para debug/auditoría (y para poder explicar “por qué”)
    inputsSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    aiMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// 1 plan por usuario por semana
weeklyPlanSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

// útil para coach dashboard
weeklyPlanSchema.index({ teamId: 1, weekStart: 1 });

export const WeeklyPlan = mongoose.model('WeeklyPlan', weeklyPlanSchema);
export const PLAN_AXES = AXES;