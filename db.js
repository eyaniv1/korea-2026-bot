const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway.internal') ? false : { rejectUnauthorized: false }
});

// Initialize tables
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS custom_pois (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      description TEXT,
      city TEXT DEFAULT 'Custom',
      category TEXT DEFAULT 'hidden-gem',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wander_users (
      telegram_user_id BIGINT PRIMARY KEY,
      name TEXT,
      pushover_key TEXT,
      enabled BOOLEAN DEFAULT false,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS alert_history (
      id SERIAL PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL,
      poi_name TEXT NOT NULL,
      alerted_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅ Database tables initialized');
}

// === CUSTOM POIs ===

async function getCustomPois() {
  const result = await pool.query('SELECT name, lat, lng, description as desc, city, category FROM custom_pois ORDER BY id');
  return result.rows;
}

async function addCustomPoiDB(name, lat, lng, desc) {
  await pool.query(
    'INSERT INTO custom_pois (name, lat, lng, description) VALUES ($1, $2, $3, $4)',
    [name, lat, lng, desc]
  );
}

async function clearCustomPoisDB() {
  await pool.query('DELETE FROM custom_pois');
}

// === WANDER USERS ===

async function getWanderUserDB(telegramUserId) {
  const result = await pool.query('SELECT * FROM wander_users WHERE telegram_user_id = $1', [telegramUserId]);
  return result.rows[0] || null;
}

async function upsertWanderUser(telegramUserId, data) {
  await pool.query(`
    INSERT INTO wander_users (telegram_user_id, name, pushover_key, enabled, lat, lng, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (telegram_user_id) DO UPDATE SET
      name = COALESCE($2, wander_users.name),
      pushover_key = COALESCE($3, wander_users.pushover_key),
      enabled = COALESCE($4, wander_users.enabled),
      lat = COALESCE($5, wander_users.lat),
      lng = COALESCE($6, wander_users.lng),
      updated_at = NOW()
  `, [telegramUserId, data.name || null, data.pushoverKey || null, data.enabled ?? null, data.lat || null, data.lng || null]);
}

async function updateWanderLocation(telegramUserId, lat, lng) {
  await pool.query(
    'UPDATE wander_users SET lat = $1, lng = $2, updated_at = NOW() WHERE telegram_user_id = $3',
    [lat, lng, telegramUserId]
  );
}

async function getAllWanderUsers() {
  const result = await pool.query('SELECT * FROM wander_users WHERE enabled = true');
  return result.rows;
}

// === ALERT HISTORY ===

async function getLastAlertTime(telegramUserId, poiName) {
  const result = await pool.query(
    'SELECT alerted_at FROM alert_history WHERE telegram_user_id = $1 AND poi_name = $2 ORDER BY alerted_at DESC LIMIT 1',
    [telegramUserId, poiName]
  );
  return result.rows[0]?.alerted_at ? new Date(result.rows[0].alerted_at).getTime() : 0;
}

async function getLastAlertTimeAny(telegramUserId) {
  const result = await pool.query(
    'SELECT alerted_at FROM alert_history WHERE telegram_user_id = $1 ORDER BY alerted_at DESC LIMIT 1',
    [telegramUserId]
  );
  return result.rows[0]?.alerted_at ? new Date(result.rows[0].alerted_at).getTime() : 0;
}

async function recordAlert(telegramUserId, poiName) {
  await pool.query(
    'INSERT INTO alert_history (telegram_user_id, poi_name) VALUES ($1, $2)',
    [telegramUserId, poiName]
  );
}

async function clearAlertHistory(telegramUserId) {
  await pool.query('DELETE FROM alert_history WHERE telegram_user_id = $1', [telegramUserId]);
}

module.exports = {
  initDB,
  getCustomPois, addCustomPoiDB, clearCustomPoisDB,
  getWanderUserDB, upsertWanderUser, updateWanderLocation, getAllWanderUsers,
  getLastAlertTime, getLastAlertTimeAny, recordAlert, clearAlertHistory,
  pool
};
