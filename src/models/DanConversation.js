import mongoose from 'mongoose';

const danConversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    title: {
      type: String,
      default: '',
      index: true,
    },

    lastResponseId: { type: String },
    historySummary: { type: String },

    chequeoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chequeo',
    },

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
    lastFlushReason: { type: String },
    lastFlushUserTurns: { type: Number },
  },
  { timestamps: true }
);

// índices útiles
danConversationSchema.index({ pendingMemoryFlush: 1, lastMessageAt: 1 });
danConversationSchema.index({ userId: 1, createdAt: -1 });
danConversationSchema.index({ userId: 1, lastMessageAt: -1 });

export const DanConversation = mongoose.model('DanConversation', danConversationSchema);
