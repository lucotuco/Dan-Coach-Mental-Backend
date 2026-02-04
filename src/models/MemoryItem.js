import mongoose from 'mongoose';

const memoryItemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sourceSessionId: {
      type: String,
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    embedding: {
      type: [Number],
      default: [],
    },
    embeddingModel: {
      type: String,
    },
  },
  { timestamps: true }
);

memoryItemSchema.index({ userId: 1, createdAt: -1 });

export const MemoryItem = mongoose.model('MemoryItem', memoryItemSchema);
