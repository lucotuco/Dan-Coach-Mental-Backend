import {
  saveSessionTranscript,
  createSessionSummary,
  updateUserProfileFromTranscript,
  createMemoryItemsFromSummary,
  refreshLongTermBriefIfNeeded,
  buildContextPack,
} from '../services/memoryService.js';

import { getCachedMemory, setCachedMemory } from '../services/memoryCache.js';
import crypto from 'crypto';

const RETRIEVAL_CACHE_TTL_MS = parseInt(
  process.env.DAN_RETRIEVAL_CACHE_TTL_MS || '180000',
  10
);

function getAuthUserId(req) {
  return (
    req.user?.id ||
    req.user?._id ||
    req.user?.userId ||
    req.user?.sub ||
    null
  );
}

function hashKey(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export async function handleSessionEnd(req, res, next) {
  try {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return res.status(401).json({ message: 'Token inválido o faltante.' });
    }

    const { userId: bodyUserId, sessionId, transcript, metadata, forceLongTerm } =
      req.body || {};

    if (bodyUserId && String(bodyUserId) !== String(authUserId)) {
      return res.status(403).json({ message: 'userId no coincide con el token.' });
    }

    const userId = authUserId;

    if (!sessionId || !transcript) {
      return res.status(400).json({
        message: 'Faltan sessionId o transcript en el body.',
      });
    }

    await saveSessionTranscript({ userId, sessionId, transcript, metadata });

    const summaryDoc = await createSessionSummary({
      userId,
      sessionId,
      transcript,
    });

    const profileResult = await updateUserProfileFromTranscript({
      userId,
      transcript,
    });

    const memoryResult = await createMemoryItemsFromSummary({
      userId,
      sessionId,
      summary: summaryDoc,
    });

    const longTermResult = await refreshLongTermBriefIfNeeded({
      userId,
      force: Boolean(forceLongTerm),
    });

    return res.status(201).json({
      session_summary_id: summaryDoc._id,
      user_profile_updated: profileResult.updated,
      memory_items_created: memoryResult.created,
      long_term_brief_updated: longTermResult.updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleContextPack(req, res, next) {
  try {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return res.status(401).json({ message: 'Token inválido o faltante.' });
    }

    const { userId: bodyUserId, messageText, metadata, tokenBudget, topK } = req.body || {};

    if (bodyUserId && String(bodyUserId) !== String(authUserId)) {
      return res.status(403).json({ message: 'userId no coincide con el token.' });
    }

    const userId = authUserId;

    if (!messageText) {
      return res.status(400).json({ message: 'Falta messageText en el body.' });
    }

    // cache key estable y pequeño
    const stableMeta = metadata ? JSON.stringify(metadata) : '';
    const cacheKey = hashKey(`${userId}::${messageText}::${stableMeta}`);

    const cached = getCachedMemory(cacheKey);
    if (cached) return res.json(cached);

    const contextResult = await buildContextPack({
      userId,
      messageText,
      metadata,
      tokenBudget,
      topK,
    });

    const payload = {
      context_pack: contextResult.contextPack,
      retrieval_debug: contextResult.retrievalDebug,
      token_estimate: contextResult.tokenEstimate,
    };

    setCachedMemory(cacheKey, payload, RETRIEVAL_CACHE_TTL_MS);

    return res.json(payload);
  } catch (error) {
    next(error);
  }
}
