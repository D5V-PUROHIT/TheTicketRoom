// Server entry point: boots HTTP server, attaches real-time WebSockets (Socket.IO), and runs DB setup.
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const app = require('./createApp');
const { pool } = require('./database/connection');
const { initializeDatabase } = require('./database/startupSetup');

const server = http.createServer(app);
const io = new Server(server);

// Require valid JWT before joining live WebSocket feed.
io.use((socket, next) => {
  try {
    jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('unauthenticated'));
  }
});

const broadcastOnlineCount = () => io.emit('presence', io.engine.clientsCount);
io.on('connection', (socket) => {
  broadcastOnlineCount();
  socket.on('disconnect', broadcastOnlineCount);
});
app.locals.io = io;

// Close HTTP server and drain DB connections cleanly on exit.
const shutdown = (signal) => {
  console.log(`[TheTicketRoom] Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log('[TheTicketRoom] HTTP server closed.');
    try {
      await pool.end();
      console.log('[TheTicketRoom] Database connection pool drained.');
    } catch (err) {
      console.error('[TheTicketRoom] Error draining pool:', err.message);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const PORT = process.env.PORT || 3000;

initializeDatabase()
  .then(() => {
    server.listen(PORT, () => console.log(`TheTicketRoom server listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('[TheTicketRoom] DB init warning:', err.message);
    server.listen(PORT, () => console.log(`TheTicketRoom server listening on port ${PORT}`));
  });
