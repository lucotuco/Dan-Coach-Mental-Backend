import mongoose from 'mongoose';

const danMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DanConversation',
      required: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    responseId: {
      type: String,
    },
  },
  { timestamps: true }
);

export const DanMessage = mongoose.model('DanMessage', danMessageSchema);
