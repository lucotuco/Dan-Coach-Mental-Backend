// src/controllers/didController.js
export const getDidConfig = async (req, res) => {
  try {
    const agentId = process.env.DID_AGENT_ID;
    const clientKey = process.env.DID_CLIENT_KEY;

    if (!agentId || !clientKey) {
      return res.status(500).json({
        error: 'Faltan DID_AGENT_ID o DID_CLIENT_KEY en .env',
      });
    }
res.setHeader('Cache-Control', 'no-store');
res.setHeader('Pragma', 'no-cache');

    return res.json({ ok: true, config: { agentId, clientKey } });
  } catch (err) {
    console.error('getDidConfig error:', err);
    return res.status(500).json({ error: 'Error interno en /api/did/config' });
  }
};
