import jwt from 'jsonwebtoken';

const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/users/login' },
  { method: 'POST', path: '/api/users' },

  // ✅ NUEVO: salud pública
  { method: 'GET', path: '/health' },
];

// ✅ NUEVO: permitir MP3 público para que D-ID lo pueda descargar
function isPublicTtsMp3(req) {
  // req.path NO incluye querystring
  const p = req.path || '';
  return (
    (req.method === 'GET' || req.method === 'HEAD') &&
    p.startsWith('/api/tts/') &&
    p.endsWith('.mp3')
  );
}

function isPublicRoute(req) {
  const requestPath = req.path;

  // ✅ NUEVO: caso especial MP3 público
  if (isPublicTtsMp3(req)) return true;

  return PUBLIC_ROUTES.some(
    (route) => route.method === req.method && route.path === requestPath,
  );
}

export function authMiddleware(req, res, next) {
  if (isPublicRoute(req)) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token de autorización faltante' });
  }

  const token = authHeader.split(' ')[1];
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!JWT_SECRET) {
    return res.status(500).json({ message: 'Configuración de JWT faltante' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}
