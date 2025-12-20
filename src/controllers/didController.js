// src/controllers/didController.js
import { Readable } from 'node:stream';

export const getDidConfig = async (_req, res) => {
  try {
    const agentId = process.env.DID_AGENT_ID;
    const clientKey = process.env.DID_CLIENT_KEY;

    if (!agentId || !clientKey) {
      return res.status(500).json({ error: 'DID_AGENT_ID o DID_CLIENT_KEY no configurados' });
    }

    return res.json({ config: { agentId, clientKey } });
  } catch (e) {
    return res.status(500).json({ error: 'Error interno en did config', details: e?.message ?? String(e) });
  }
};

/**
 * GET/HEAD /api/did/idle-video?src=https://....
 * Proxy para evitar CORS al reproducir idle_video en <video>.
 */
export const proxyIdleVideo = async (req, res) => {
  try {
    const src = (req.query.src ?? '').toString().trim();
    if (!src) return res.status(400).send('Missing src');

    // Hardening mínimo: solo permitir https y dominios esperables
    let u;
    try { u = new URL(src); } catch { return res.status(400).send('Invalid src'); }
    if (u.protocol !== 'https:') return res.status(400).send('Invalid protocol');

    // Ajustá si tu idle_video viene de otro host, pero NO lo abras a cualquier dominio.
    const allowedHosts = new Set([
      'cdn.d-id.com',
      'd-id-public-bucket.s3.amazonaws.com',
      u.host, // fallback por si D-ID rota host; si querés más estricto, sacalo.
    ]);

    if (!allowedHosts.has(u.host)) {
      return res.status(403).send('Host not allowed');
    }

    const range = req.headers.range;

    const upstream = await fetch(src, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: range ? { Range: range } : {},
    });

    // Pasar status y headers relevantes
    res.status(upstream.status);

    const passHeaders = [
      'content-type',
      'content-length',
      'accept-ranges',
      'content-range',
      'cache-control',
      'etag',
      'last-modified',
    ];

    for (const h of passHeaders) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }

    // Importante para web
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'HEAD') return res.end();

    if (!upstream.body) return res.status(502).send('Upstream has no body');

    // Node 18+: convertir ReadableStream web -> Node stream
    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.pipe(res);
  } catch (e) {
    console.error('[DID][idle-video] proxy error:', e);
    return res.status(500).send('Proxy error');
  }
};
