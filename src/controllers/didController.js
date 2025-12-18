export const getDidConfig = async (req, res) => {
  try {
    const agentId = process.env.DID_AGENT_ID;
    const clientKey = process.env.DID_CLIENT_KEY;

    if (!agentId || !clientKey) {
      return res.status(500).json({
        error: 'Faltan DID_AGENT_ID o DID_CLIENT_KEY en .env',
      });
    }

    console.log('[DID] config served', { agentId: `${agentId.slice(0, 12)}...`, clientKeyLen: clientKey.length });

    return res.json({ agentId, clientKey });
  } catch (err) {
    console.error('getDidConfig error:', err);
    return res.status(500).json({ error: 'Error interno en /api/did/config' });
  }
};
