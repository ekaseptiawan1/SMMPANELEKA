function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Akses admin diperlukan.' });
  next();
}
module.exports = { requireAuth, requireAdmin };
