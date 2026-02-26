// src/middleware/requireRole.js
module.exports = function requireRole(allowed) {
  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];

  return (req, res, next) => {
    if (!req.user?.role) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};