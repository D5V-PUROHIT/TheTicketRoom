// Handles user registration and sign-in endpoints (/api/auth/register, /api/auth/login).
const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../database/connection');
const { createAuthToken, publicUserProfile } = require('../middleware/authMiddleware');
const { AppError, catchAsync } = require('../middleware/errorMiddleware');

const router = express.Router();

// Register a new customer account.
router.post('/register', catchAsync(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.length > 60) {
    throw new AppError(400, 'VALIDATION', 'Enter your name');
  }
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AppError(400, 'VALIDATION', 'Enter a valid email');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    throw new AppError(400, 'VALIDATION', 'Password must be 8 to 72 characters');
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows: [user] } = await pool.query(
      "INSERT INTO users(name, email, password_hash, role) VALUES ($1, $2, $3, 'user') RETURNING *",
      [name.trim(), email.toLowerCase(), hash]
    );
    res.status(201).json({ token: createAuthToken(user), user: publicUserProfile(user) });
  } catch (err) {
    if (err.code === '23505') throw new AppError(409, 'EMAIL_TAKEN', 'That email is already registered');
    throw err;
  }
}));

// Authenticate an existing customer or admin.
router.post('/login', catchAsync(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new AppError(400, 'VALIDATION', 'Email and password are required');
  }

  const { rows: [user] } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError(401, 'BAD_CREDENTIALS', 'Incorrect email or password');
  }
  if (user.is_suspended) {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Your account has been temporarily suspended. Contact support.');
  }

  res.json({ token: createAuthToken(user), user: publicUserProfile(user) });
}));

module.exports = router;
