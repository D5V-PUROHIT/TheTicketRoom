async function logAudit(clientOrPool, { adminId, action, targetType, targetId, details = {}, reason = '' }) {
  try {
    await clientOrPool.query(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [adminId || null, action, targetType, targetId || null, JSON.stringify(details), reason || null]
    );
  } catch (err) {
    console.error('Audit log failed to write:', err.message);
  }
}

module.exports = { logAudit };
