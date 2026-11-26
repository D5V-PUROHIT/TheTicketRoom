// Frees all held/booked seats and deletes all bookings, so the hall starts empty.
// Usage: node scripts/resetHallSeats.js --yes
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

const hasColumn = async (c, table, col) =>
    (await c.query(
        `SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, [table, col])).rowCount > 0;

(async () => {
    if (!process.argv.includes('--yes')) {
        console.log('This deletes ALL bookings and releases ALL held/booked seats.');
        console.log('Run again with --yes to continue.');
        return pool.end();
    }
    const c = await pool.connect();
    try {
        await c.query('BEGIN');

        // 1. Find the seat table (new multi-show schema first, original schema as fallback).
        const seatTable = (await hasColumn(c, 'show_seats', 'booking_id')) ? 'show_seats' : 'seats';

        // 2. Release held and booked seats, only touching columns that exist.
        const sets = ["status='available'"];
        for (const col of ['held_by', 'hold_expires_at', 'booking_id']) {
            if (await hasColumn(c, seatTable, col)) sets.push(`${col}=NULL`);
        }
        const released = await c.query(
            `UPDATE ${seatTable} SET ${sets.join(', ')} WHERE status IN ('held','booked')`);

        // 3. Clear every other table that points at bookings (payments, refunds, and so on).
        const { rows: deps } = await c.query(
            `SELECT DISTINCT k.conrelid::regclass::text AS tbl
       FROM pg_constraint k
       WHERE k.contype='f' AND k.confrelid='bookings'::regclass`);
        for (const { tbl } of deps) {
            if (tbl === seatTable || tbl === 'bookings') continue;
            await c.query(`TRUNCATE ${tbl} CASCADE`);
            console.log('Cleared dependent table:', tbl);
        }

        // 4. Now bookings can be deleted safely.
        const del = await c.query('DELETE FROM bookings');
        await c.query('COMMIT');

        const users = (await c.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
        const seats = await c.query(`SELECT status, count(*)::int AS n FROM ${seatTable} GROUP BY status ORDER BY status`);
        console.log(`Released ${released.rowCount} seats, deleted ${del.rowCount} bookings.`);
        console.log('Users in database:', users);
        console.log('Seats by status:', seats.rows.map((r) => `${r.status}=${r.n}`).join(', '));
    } catch (e) {
        await c.query('ROLLBACK').catch(() => { });
        console.error('Reset failed:', e.message);
        process.exitCode = 1;
    } finally {
        c.release();
        await pool.end();
    }
})();