import mongoose from 'mongoose';
import { RealtimeSessionState } from '../models/RealtimeSessionState.js';
import { SessionTranscript } from '../models/SessionTranscript.js';

import {
  createSessionSummary,
  updateUserProfileFromTranscript,
  createMemoryItemsFromSummary,
  refreshLongTermBriefIfNeeded,
} from './memoryService.js';

import { CoachSession } from '../models/CoachSession.js';

function oid(id) {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

async function finalizeRealtimeFromTranscript({
  userId,
  sessionId,
  transcript,
  metadata,
  forceLongTerm = false,
  finalizedBy = 'reconciler',
}) {
  // sessionId FINAL para pipeline
  const finalSessionId = `${String(sessionId)}:final`;

  const summaryDoc = await createSessionSummary({
    userId,
    sessionId: finalSessionId,
    transcript,
  });

  const profileResult = await updateUserProfileFromTranscript({ userId, transcript });

  const memoryResult = await createMemoryItemsFromSummary({
    userId,
    sessionId: finalSessionId,
    summary: summaryDoc,
  });

  const longTermResult = await refreshLongTermBriefIfNeeded({
    userId,
    force: Boolean(forceLongTerm),
  });

  await CoachSession.create({
    owner: userId,
    canal: 'realtime',
    resumen: summaryDoc?.contexto || '',
    puntosClave: Array.isArray(summaryDoc?.acuerdos_tareas) ? summaryDoc.acuerdos_tareas : [],
    proximoPaso:
      Array.isArray(summaryDoc?.plan_accion) && summaryDoc.plan_accion.length
        ? summaryDoc.plan_accion[0]
        : '',
    modelo: process.env.DAN_REALTIME_MODEL || 'gpt-realtime',
  });

  return {
    finalSessionId,
    summaryId: summaryDoc?._id,
    profileUpdated: profileResult?.updated,
    memoryCreated: memoryResult?.created,
    longTermUpdated: longTermResult?.updated,
    finalizedBy,
    metadata,
  };
}

/**
 * Reconciler: cierra sesiones realtime automáticamente si hubo silencio >= idleMs.
 *
 * Estrategia:
 * - Busca states status=open con lastActivityAt <= cutoff
 * - Las "lockea" con findOneAndUpdate a status=processing
 * - Lee transcript guardado (SessionTranscript)
 * - Ejecuta pipeline (summary/profile/memory)
 * - Marca state status=finalized
 */
export async function runPendingRealtimeFinalizations({
  idleMs = 90_000,
  limit = 25,
  forceLongTerm = false,
} = {}) {
  const cutoff = new Date(Date.now() - idleMs);

  const candidates = await RealtimeSessionState.find({
    status: 'open',
    lastActivityAt: { $lte: cutoff },
  })
    .sort({ lastActivityAt: 1 })
    .limit(limit)
    .select('_id userId sessionId lastActivityAt metadata')
    .lean();

  let scanned = candidates.length;
  let finalized = 0;
  let skippedNoTranscript = 0;
  let errors = 0;

  for (const c of candidates) {
    // Lock: pasar de open -> processing sólo si sigue open
    const locked = await RealtimeSessionState.findOneAndUpdate(
      { _id: c._id, status: 'open' },
      { $set: { status: 'processing', lastError: '' } },
      { new: true }
    ).lean();

    if (!locked) continue;

    try {
      const uId = oid(locked.userId) || locked.userId;

      const t = await SessionTranscript.findOne({
        userId: uId,
        sessionId: String(locked.sessionId),
      })
        .select('transcript metadata updatedAt createdAt')
        .lean();

      if (!t?.transcript) {
        skippedNoTranscript += 1;
        await RealtimeSessionState.findByIdAndUpdate(locked._id, {
          $set: {
            status: 'open', // vuelve a open por si llega un autosave después
            lastError: 'missing_transcript',
          },
        });
        continue;
      }

      const result = await finalizeRealtimeFromTranscript({
        userId: uId,
        sessionId: locked.sessionId,
        transcript: t.transcript,
        metadata: { ...(locked.metadata || {}), ...(t.metadata || {}), reason: 'reconciler' },
        forceLongTerm,
        finalizedBy: 'reconciler',
      });

      await RealtimeSessionState.findByIdAndUpdate(locked._id, {
        $set: {
          status: 'finalized',
          lastFinalizeAt: new Date(),
          finalizedBy: 'reconciler',
          lastError: '',
          metadata: { ...(locked.metadata || {}), lastFinalSummaryId: String(result.summaryId || '') },
        },
      });

      finalized += 1;
    } catch (e) {
      errors += 1;
      await RealtimeSessionState.findByIdAndUpdate(locked._id, {
        $set: {
          status: 'open',
          lastError: String(e?.message || e),
        },
      });
      console.error('[DAN][REALTIME][RECONCILER] finalize error:', e);
    }
  }

  return {
    cutoff: cutoff.toISOString(),
    scanned,
    finalized,
    skippedNoTranscript,
    errors,
  };
}
