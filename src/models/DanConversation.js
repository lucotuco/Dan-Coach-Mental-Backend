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


endedAt: {
  type: Date,
  default: null,
  index: true,
},
titleGeneratedAt: {
  type: Date,
  default: null,
  index: true,
},
titleModel: { type: String },
titlePromptVersion: { type: Number },
    pinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    pinnedAt: {
      type: Date,
      default: null,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
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
      default: null,
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
danConversationSchema.index({ userId: 1, deletedAt: 1, lastMessageAt: -1 });
danConversationSchema.index({ userId: 1, pinned: -1, pinnedAt: -1, lastMessageAt: -1 });
danConversationSchema.index({ pendingMemoryFlush: 1, lastMessageAt: 1 });

export const DanConversation = mongoose.model('DanConversation', danConversationSchema);
