const http = require('http'), jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const app = require('./app');
const pool = require('./db');

const server = http.createServer(app);
const io = new Server(server);
io.use((socket, next) => {
  try { jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET); next(); }
  catch { next(new Error('unauthenticated')); }
});
const presence = () => io.emit('presence', io.engine.clientsCount);
io.on('connection', (s) => { presence(); s.on('disconnect', presence); });
app.locals.io = io;

// Persists expiry of unconfirmed holds (reads already treat expired holds as available)
// and tells every connected client.
setInterval(async () => {
  try {
    const { rows } = await pool.query(
      `UPDATE seats SET status='available', held_by=NULL, hold_expires_at=NULL
       WHERE status='held' AND hold_expires_at <= now() RETURNING id`
    );
    if (rows.length) app.locals.broadcast(rows.map((r) => r.id));
  } catch (e) { console.error('sweeper', e.message); }
}, 3000);

server.listen(process.env.PORT || 3000, () => console.log('Listening on', server.address().port));
