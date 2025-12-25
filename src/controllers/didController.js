// src/controllers/didController.js

const mask = (s = '') => (s ? `${s.slice(0, 3)}***${s.slice(-3)}` : '');

export async function getDidConfig(req, res) {
  // Soporta varios nombres por si los cambiaste
  const agentId =
    (process.env.DID_AGENT_ID ||
      process.env.D_ID_AGENT_ID ||
      process.env.DID_AGENTID ||
      '').trim();

  const clientKey =
    (process.env.DID_CLIENT_KEY ||
      process.env.D_ID_CLIENT_KEY ||
      process.env.DID_CLIENTKEY ||
      '').trim();

  console.log('[didController] GET /api/did/config', {
    hasAgentId: !!agentId,
    clientKey: mask(clientKey),
    origin: req.headers.origin,
    host: req.headers.host,
  });

  if (!agentId || !clientKey) {
    return res.status(500).json({
      error: 'DID config missing env vars',
      hasAgentId: !!agentId,
      hasClientKey: !!clientKey,
    });
  }

  return res.json({ agentId, clientKey });
}
