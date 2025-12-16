import jwt from 'jsonwebtoken';

const PUBLIC_ROUTES_EXACT = [
  { method: 'POST', path: '/api/users/login' },
  { method: 'POST', path: '/api/users' },
];

// Prefix routes (para paths con params)
const PUBLIC_ROUTES_PREFIX = [
  // ✅ D-ID tiene que poder descargar /api/tts/<id>.mp3 sin JWT
  { method: 'GET', prefix: '/api/tts/' },
  { method: 'HEAD', prefix: '/api/tts/' },
];

function isPublicRoute(req) {
  const requestPath = req.path;

  const exact = PUBLIC_ROUTES_EXACT.some(
    (route) => route.method === req.method && route.path === requestPath,
  );
  if (exact) return true;

  const pref = PUBLIC_ROUTES_PREFIX.some(
    (route) =>
      route.method === req.method &&
      requestPath.startsWith(route.prefix),
  );
  return pref;
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
