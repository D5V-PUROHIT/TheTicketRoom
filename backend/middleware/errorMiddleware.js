// Custom error class and Express middleware to keep API error responses consistent.

class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Wraps async route functions so thrown errors automatically go to Express error handler.
const catchAsync = (handler) => (req, res, next) => handler(req, res, next).catch(next);

// Handles any unknown /api/... URL.
const unknownApiHandler = (req, res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Unknown API endpoint'));
};

// Formats all errors into clean JSON responses.
const globalErrorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid JSON payload' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Internal server error occurred' } });
};

module.exports = { AppError, catchAsync, unknownApiHandler, globalErrorHandler };
