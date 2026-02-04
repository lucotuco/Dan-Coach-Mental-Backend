import { saveSessionTranscript, createSessionSummary, updateUserProfileFromTranscript, createMemoryItemsFromSummary, refreshLongTermBriefIfNeeded, buildContextPack, } from '../services/memoryService.js';
import { getCachedMemory, setCachedMemory } from '../services/memoryCache.js';

const RETRIEVAL_CACHE_TTL_MS = parseInt(
  process.env.DAN_RETRIEVAL_CACHE_TTL_MS || '180000',
  10
);

export async function handleSessionEnd(req, res, next) {
  try {
    const { userId, sessionId, transcript, metadata, forceLongTerm } =
      req.body || {};

    if (!userId || !sessionId || !transcript) {
      return res.status(400).json({
        message: 'Faltan userId, sessionId o transcript en el body.',
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
    const { userId, messageText, metadata, tokenBudget, topK } = req.body || {};

    if (!userId || !messageText) {
      return res
        .status(400)
        .json({ message: 'Faltan userId o messageText en el body.' });
    }

    const cacheKey = `${userId}:${messageText}:${JSON.stringify(
      metadata || {}
    )}`;
    const cached = getCachedMemory(cacheKey);
    if (cached) {
      return res.json(cached);
    }

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
    };

    setCachedMemory(cacheKey, payload, RETRIEVAL_CACHE_TTL_MS);

    return res.json(payload);
  } catch (error) {
    next(error);
  }
}
