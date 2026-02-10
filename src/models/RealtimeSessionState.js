import mongoose from 'mongoose';

const realtimeSessionStateSchema = new mongoose.Schema(
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

    // open -> processing -> finalized
    status: {
      type: String,
      enum: ['open', 'processing', 'finalized'],
      default: 'open',
      index: true,
    },

    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastAutosaveAt: {
      type: Date,
    },
    lastFinalizeAt: {
      type: Date,
    },

    // Para debug/analytics
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Diagnóstico
    lastError: { type: String },
    finalizedBy: { type: String }, // 'client' | 'reconciler'
  },
  { timestamps: true }
);

realtimeSessionStateSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

export const RealtimeSessionState = mongoose.model(
  'RealtimeSessionState',
  realtimeSessionStateSchema
);
