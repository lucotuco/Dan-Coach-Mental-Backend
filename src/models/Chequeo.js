import mongoose from 'mongoose';

const chequeoSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    fecha: {
      type: Date,
      required: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:'Team',
      required: true,
    },
    notes:{
      type:String
    },
    scores: {
    confianza: Number,
    disciplina: Number,
    persistencia: Number,
    concentracion: Number,
    vinculacion: Number,
    regulacionEmocional: Number,
    superacion: Number,
    liderazgo: Number,
},
    audio: {
      url: { type: String },
      transcript: { type: String },
      summary: { type: String },
      tags: [{ type: String }],
      durationSeconds: { type: Number },
    },
  },
  { timestamps: true }
);

export const Chequeo = mongoose.model('Chequeo', chequeoSchema);
