import mongoose from 'mongoose';

const danConversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
  },
  { timestamps: true }
);

export const DanConversation = mongoose.model(
  'DanConversation',
  danConversationSchema
);
