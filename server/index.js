const http = require('http'), jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const app = require('./app');
const pool = require('./db');

const server = http.createServer(app);
const io = new Server(server);
io.use((socket, next) => {
  try {
    jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('unauthenticated'));
  }
});

const presence = () => io.emit('presence', io.engine.clientsCount);
io.on('connection', (s) => {
  presence();
  s.on('disconnect', presence);
});
app.locals.io = io;

// Graceful shutdown handling
const shutdown = (signal) => {
  console.log(`[TheTicketRoom] Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log('[TheTicketRoom] HTTP server closed.');
    try {
      await pool.end();
      console.log('[TheTicketRoom] Database connection pool drained.');
    } catch (e) {
      console.error('[TheTicketRoom] Error draining pool:', e.message);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`TheTicketRoom server listening on port ${PORT}`));
