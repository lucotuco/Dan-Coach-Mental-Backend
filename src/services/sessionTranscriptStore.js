// src/services/sessionTranscriptStore.js
import { SessionTranscript } from '../models/SessionTranscript.js';

/**
 * Upsert del transcript (sirve para autosave).
 * - Si existe, actualiza transcript/metadata.
 * - Si no existe, lo crea.
 */
export async function upsertSessionTranscript({ userId, sessionId, transcript, metadata }) {
  const doc = await SessionTranscript.findOneAndUpdate(
    { userId, sessionId },
    {
      $set: {
        transcript: String(transcript || ''),
        metadata: metadata || {},
      },
    },
    { upsert: true, new: true }
  );
  return doc;
}
