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

const answerSchema = new mongoose.Schema(
  {
    qid: { type: String, required: true },     // id estable de pregunta (no el texto)
    value: { type: Number, required: true, min: 1, max: 10 },
  },
  { _id: false }
);

// answers como objeto: { disciplina: [..], persistencia: [..], ... }
const answersShape = AXES.reduce((acc, axis) => {
  acc[axis] = { type: [answerSchema], default: undefined, required: true };
  return acc;
}, {});

const scoresShape = AXES.reduce((acc, axis) => {
  acc[axis] = { type: Number, required: true, min: 1, max: 10 };
  return acc;
}, {});

const checkinSchema = new mongoose.Schema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weekStart: { type: Date, required: true, index: true },

    answers: { type: answersShape, required: true },
    scores: { type: scoresShape, required: true },

    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

checkinSchema.index({ userId: 1, weekStart: 1 }, { unique: true });
checkinSchema.index({ teamId: 1, weekStart: 1 });

export const Checkin = mongoose.model('Checkin', checkinSchema);
export const CHECKIN_AXES = AXES;