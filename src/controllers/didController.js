// src/controllers/didController.js
import { Readable } from 'node:stream';

const ALLOWED_HOSTS = new Set([
  'agents-results.d-id.com',
  'd-id-public-bucket.s3.amazonaws.com',
  'cdn.d-id.com',
]);

export async function getDidConfig(req, res) {
  // Ajustá estos nombres de env a los tuyos
  const agentId = process.env.DID_AGENT_ID || '';
  const clientKey = process.env.DID_API_KEY || '';

  return res.json({
    agentId,
    clientKey,
  });
}

export async function proxyIdleVideo(req, res) {
  try {
    const rawUrl = req.query.url;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).json({ error: 'Missing url' });
    }

    let target;
    try {
      target = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid url' });
    }

    if (target.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only https is allowed' });
    }

    // Allowlist básico (evita proxy abierto)
    if (!ALLOWED_HOSTS.has(target.hostname)) {
      return res.status(403).json({ error: 'Host not allowed', host: target.hostname });
    }

    const range = req.headers.range;

    const upstream = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        ...(range ? { Range: range } : {}),
        // ayuda a algunos CDNs
        'User-Agent': 'dan-idle-proxy/1.0',
      },
      redirect: 'follow',
    });

    // Copiar status (200 o 206)
    res.status(upstream.status);

    // Copiar headers relevantes
    const passHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control',
      'etag',
      'last-modified',
    ];

    for (const h of passHeaders) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }

    // Si upstream no setea content-type, forzamos mp4
    if (!res.getHeader('content-type')) {
      res.setHeader('content-type', 'video/mp4');
    }

    // CORS no es estrictamente necesario para playback, pero ayuda en dev
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-expose-headers', 'Content-Range, Accept-Ranges, Content-Length');

    if (!upstream.body) {
      return res.end();
    }

    // Node fetch -> WebStream => convertir a Node stream
    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on('error', (e) => {
      console.error('[didController] proxy stream error', e);
      try {
        res.end();
      } catch {}
    });

    nodeStream.pipe(res);
  } catch (e) {
    console.error('[didController] proxyIdleVideo error', e);
    res.status(500).json({ error: 'Proxy failed' });
  }
}
