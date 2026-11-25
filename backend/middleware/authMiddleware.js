// Handles user login tokens (JWT) and checks admin role permissions.
const jwt = require('jsonwebtoken');
const { AppError } = require('./errorMiddleware');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is required');

// Creates a signed 8-hour token after successful login or signup.
const createAuthToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, email: user.email }, SECRET, { expiresIn: '8h' });

// Strips password hash before sending user info to the browser.
const publicUserProfile = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});

// Blocks unauthenticated requests with 401.
const requireLogin = (req, res, next) => {
  try {
    const rawToken = (req.get('Authorization') || '').replace('Bearer ', '');
    req.user = jwt.verify(rawToken, SECRET);
    next();
  } catch {
    next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue'));
  }
};

// Reads login token if provided (useful so guests can view the seat map while signed-in users see their quota).
const optionalLogin = (req, res, next) => {
  try {
    const rawToken = (req.get('Authorization') || '').replace('Bearer ', '');
    if (rawToken) req.user = jwt.verify(rawToken, SECRET);
  } catch {}
  next();
};

// Restricts admin APIs to specific staff roles (super_admin and admin always pass).
const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return next(new AppError(401, 'UNAUTHENTICATED', 'Sign in required'));
  const userRole = req.user.role;
  if (userRole === 'super_admin' || userRole === 'admin') return next();
  if (allowedRoles.includes(userRole)) return next();
  next(new AppError(403, 'FORBIDDEN', `Access forbidden: requires ${allowedRoles.join(' or ')} permission`));
};

const requireAnyAdmin = requireRole('super_admin', 'operations', 'support', 'finance', 'marketing');

module.exports = {
  createAuthToken,
  publicUserProfile,
  requireLogin,
  optionalLogin,
  requireRole,
  requireAnyAdmin,
};
