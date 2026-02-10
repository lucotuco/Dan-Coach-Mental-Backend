import mongoose from 'mongoose';

const danConversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
    },
    lastResponseId: {
      type: String,
    },
    historySummary: {
      type: String,
    },
    chequeoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chequeo',
    },

    // ✅ Opción 1 (robusta): estado de flush de memoria
    pendingMemoryFlush: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastMessageAt: {
      type: Date,
      index: true,
    },
    lastFlushedAt: {
      type: Date,
      index: true,
    },
    lastFlushReason: {
      type: String, // 'n_turns' | 'idle_flush' | 'reconciler'
    },
    lastFlushUserTurns: {
      type: Number,
    },
  },
  { timestamps: true }
);

// índices útiles para el reconciler
danConversationSchema.index({ pendingMemoryFlush: 1, lastMessageAt: 1 });
danConversationSchema.index({ userId: 1, createdAt: -1 });

export const DanConversation = mongoose.model(
  'DanConversation',
  danConversationSchema
);
