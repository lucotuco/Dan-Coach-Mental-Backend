// src/middleware/requireTeam.js
module.exports = function requireTeam() {
  return (req, res, next) => {
    if (!req.user?.teamId) {
      return res.status(400).json({ error: 'User has no team' });
    }
    next();
  };
};