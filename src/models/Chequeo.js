import mongoose from 'mongoose';

const chequeoSchema = new mongoose.Schema(
  {
    fecha: {
      type: Date,
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tipo: {
      type: String,
      required: true,
    },
    variable1: {
      type: Number,
      required: false,
    },
    variable2: {
      type: Number,
      required: false,
    },
    variable3: {
      type: Number,
      required: false,
    },
    variable4: {
      type: Number,
      required: false,
    },
    variable5: {
      type: Number,
      required: false,
    },
    variable6: {
      type: Number,
      required: false,
    },
    variable7: {
      type: Number,
      required: false,
    },
  },
  { timestamps: true }
);

export const Chequeo = mongoose.model('Chequeo', chequeoSchema);
