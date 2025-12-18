// src/controllers/didController.js
const DEBUG_DID = process.env.DEBUG_DID === '1';

export const getDidConfig = async (req, res) => {
  try {
    // Evitar 304 / caches raros en config
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');

    const agentId = process.env.DID_AGENT_ID;
    const clientKey = process.env.DID_CLIENT_KEY;

    if (!agentId || !clientKey) {
      return res.status(500).json({
        error: 'Faltan DID_AGENT_ID o DID_CLIENT_KEY en .env',
      });
    }

    if (DEBUG_DID) {
      console.log('[DID] config served', { agentId: agentId.slice(0, 12) + '...' });
    }

    return res.json({ agentId, clientKey });
  } catch (err) {
    console.error('getDidConfig error:', err);
    return res.status(500).json({ error: 'Error interno en /api/did/config' });
  }
};
