// src/controllers/didController.js
export const getDidConfig = async (req, res) => {
  try {
    // Ajustá los nombres de env a los tuyos reales si difieren.
    const agentId =
      process.env.DID_AGENT_ID ||
      process.env.D_ID_AGENT_ID ||
      process.env.DID_AGENT ||
      '';

    const clientKey =
      process.env.DID_CLIENT_KEY ||
      process.env.D_ID_CLIENT_KEY ||
      process.env.DID_KEY ||
      '';

    if (!agentId || !clientKey) {
      return res.status(500).json({
        error: 'D-ID config faltante en el server',
        details: {
          hasAgentId: Boolean(agentId),
          hasClientKey: Boolean(clientKey),
        },
      });
    }

    // Formato compatible con lo que ya estabas usando
    const config = { agentId, clientKey };

    console.log('[DID] config served', {
      agentId: agentId.slice(0, 12) + '...',
      clientKeyLen: clientKey.length,
    });

    return res.json({ ok: true, config });
  } catch (e) {
    console.error('[DID] getDidConfig error:', e);
    return res.status(500).json({ error: 'Error interno devolviendo D-ID config' });
  }
};

// Proxy para assets (idle_video) evitando CORS
export const proxyDidAsset = async (req, res) => {
  try {
    const url = String(req.query.url || '').trim();
    if (!url) return res.status(400).send('Missing url');

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).send('Invalid url');
    }

    // Seguridad básica: solo permitir hosts de D-ID
    const host = parsed.hostname.toLowerCase();
    const allowedHosts = new Set([
      'agents-results.d-id.com',
      'create-images-results.d-id.com',
      'd-id-public-bucket.s3.amazonaws.com',
    ]);

    const okHost = [...allowedHosts].some((h) => host === h || host.endsWith(`.${h}`));
    if (!okHost) return res.status(403).send('Host not allowed');

    const upstream = await fetch(url, { method: 'GET' });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(502).send(`Upstream error: ${upstream.status} ${text.slice(0, 200)}`);
    }

    // Headers útiles para navegador
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');

    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);

    // Soporte para HEAD (D-ID a veces valida con HEAD)
    if (req.method === 'HEAD') return res.status(200).end();

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.status(200).send(buf);
  } catch (e) {
    console.error('[DID] proxyDidAsset error:', e);
    return res.status(500).send('Proxy error');
  }
};
