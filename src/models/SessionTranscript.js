import mongoose from 'mongoose';

const sessionTranscriptSchema = new mongoose.Schema(
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
    transcript: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

// ✅ evita duplicados por retries
sessionTranscriptSchema.index({ userId: 1, sessionId: 1 }, { unique: true });
sessionTranscriptSchema.index({ userId: 1, createdAt: -1 });

export const SessionTranscript = mongoose.model(
  'SessionTranscript',
  sessionTranscriptSchema
);
