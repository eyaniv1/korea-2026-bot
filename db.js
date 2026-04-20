const { Pool } = require('pg');

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:NMfJJeKbQFUBUgAxTCDCOXETwIDKUJdU@monorail.proxy.rlwy.net:34168/railway';
console.log('DB URL configured:', dbUrl ? `${dbUrl.substring(0, 30)}...` : 'NOT SET');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl?.includes('railway.internal') ? false : { rejectUnauthorized: false }
});

// Initialize tables
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      pushover_key TEXT,
      telegram_user_id BIGINT UNIQUE,
      web_session_id TEXT,
      enabled BOOLEAN DEFAULT false,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_pois (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      description TEXT,
      city TEXT DEFAULT 'Custom',
      category TEXT DEFAULT 'hidden-gem',
      created_by TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS alert_history (
      id SERIAL PRIMARY KEY,
      user_name TEXT NOT NULL,
      poi_name TEXT NOT NULL,
      alerted_at TIMESTAMP DEFAULT NOW()
    );

    -- Migrate from old tables if they exist
    DO $$ BEGIN
      IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'wander_users') THEN
        INSERT INTO users (name, pushover_key, telegram_user_id, enabled, lat, lng)
        SELECT name, pushover_key, telegram_user_id, enabled, lat, lng FROM wander_users
        ON CONFLICT (name) DO NOTHING;
        DROP TABLE wander_users;
      END IF;
    END $$;
  `);
  console.log('✅ Database tables initialized');
}

// === USERS ===

async function getUserByName(name) {
  const result = await pool.query('SELECT * FROM users WHERE LOWER(name) = LOWER($1)', [name]);
  return result.rows[0] || null;
}

async function getUserByTelegramId(telegramId) {
  const result = await pool.query('SELECT * FROM users WHERE telegram_user_id = $1', [telegramId]);
  return result.rows[0] || null;
}

async function getUserBySessionId(sessionId) {
  const result = await pool.query('SELECT * FROM users WHERE web_session_id = $1', [sessionId]);
  return result.rows[0] || null;
}

async function getAllUsers() {
  const result = await pool.query('SELECT * FROM users ORDER BY name');
  return result.rows;
}

async function getEnabledUsers() {
  const result = await pool.query('SELECT * FROM users WHERE enabled = true');
  return result.rows;
}

async function upsertUser(data) {
  // data: { name, pushoverKey, telegramUserId, webSessionId, enabled, lat, lng }
  try {
    // First try to find by telegram_user_id if provided (in case name changed)
    if (data.telegramUserId) {
      const existing = await pool.query('SELECT * FROM users WHERE telegram_user_id = $1', [data.telegramUserId]);
      if (existing.rows[0]) {
        // Update existing user
        const result = await pool.query(`
          UPDATE users SET
            name = COALESCE($1, name),
            pushover_key = COALESCE($2, pushover_key),
            web_session_id = COALESCE($3, web_session_id),
            enabled = COALESCE($4, enabled),
            lat = COALESCE($5, lat),
            lng = COALESCE($6, lng),
            updated_at = NOW()
          WHERE telegram_user_id = $7
          RETURNING *
        `, [
          data.name || null,
          data.pushoverKey || null,
          data.webSessionId || null,
          data.enabled ?? null,
          data.lat || null,
          data.lng || null,
          data.telegramUserId
        ]);
        return result.rows[0];
      }
    }
    // Insert new user
    const result = await pool.query(`
      INSERT INTO users (name, pushover_key, telegram_user_id, web_session_id, enabled, lat, lng, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (name) DO UPDATE SET
        pushover_key = COALESCE($2, users.pushover_key),
        telegram_user_id = COALESCE($3, users.telegram_user_id),
        web_session_id = COALESCE($4, users.web_session_id),
        enabled = COALESCE($5, users.enabled),
        lat = COALESCE($6, users.lat),
        lng = COALESCE($7, users.lng),
        updated_at = NOW()
      RETURNING *
    `, [
      data.name,
      data.pushoverKey || null,
      data.telegramUserId || null,
      data.webSessionId || null,
      data.enabled ?? null,
      data.lat || null,
      data.lng || null
    ]);
    return result.rows[0];
  } catch (err) {
    console.error('upsertUser error:', err.message, 'data:', JSON.stringify(data));
    throw err;
  }
}

async function updateUserLocation(name, lat, lng) {
  await pool.query('UPDATE users SET lat = $1, lng = $2, updated_at = NOW() WHERE LOWER(name) = LOWER($3)', [lat, lng, name]);
}

// === SETTINGS ===

async function getSetting(key, defaultValue) {
  const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return result.rows[0] ? result.rows[0].value : defaultValue;
}

async function setSetting(key, value) {
  await pool.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
    [key, String(value)]
  );
}

async function loadSettings() {
  const radius = await getSetting('alertRadius', '150');
  const cooldown = await getSetting('alertCooldown', '5');
  const revisit = await getSetting('alertRevisit', '4');
  return {
    alertRadius: parseInt(radius),
    alertCooldown: parseInt(cooldown) * 60 * 1000,
    alertRevisitCooldown: parseFloat(revisit) * 60 * 60 * 1000
  };
}

// === CUSTOM POIs ===

async function getCustomPois() {
  const result = await pool.query('SELECT name, lat, lng, description as desc, city, category FROM custom_pois ORDER BY id');
  return result.rows;
}

async function addCustomPoiDB(name, lat, lng, desc, createdBy) {
  await pool.query(
    'INSERT INTO custom_pois (name, lat, lng, description, created_by) VALUES ($1, $2, $3, $4, $5)',
    [name, lat, lng, desc, createdBy || null]
  );
}

async function clearCustomPoisDB(createdBy) {
  if (createdBy) {
    await pool.query('DELETE FROM custom_pois WHERE LOWER(created_by) = LOWER($1)', [createdBy]);
  } else {
    await pool.query('DELETE FROM custom_pois');
  }
}

// === ALERT HISTORY ===

async function getLastAlertTime(userName, poiName) {
  const result = await pool.query(
    'SELECT alerted_at FROM alert_history WHERE LOWER(user_name) = LOWER($1) AND poi_name = $2 ORDER BY alerted_at DESC LIMIT 1',
    [userName, poiName]
  );
  return result.rows[0]?.alerted_at ? new Date(result.rows[0].alerted_at).getTime() : 0;
}

async function getLastAlertTimeAny(userName) {
  const result = await pool.query(
    'SELECT alerted_at FROM alert_history WHERE LOWER(user_name) = LOWER($1) ORDER BY alerted_at DESC LIMIT 1',
    [userName]
  );
  return result.rows[0]?.alerted_at ? new Date(result.rows[0].alerted_at).getTime() : 0;
}

async function recordAlert(userName, poiName) {
  await pool.query(
    'INSERT INTO alert_history (user_name, poi_name) VALUES ($1, $2)',
    [userName, poiName]
  );
}

module.exports = {
  initDB, pool,
  getUserByName, getUserByTelegramId, getUserBySessionId,
  getAllUsers, getEnabledUsers, upsertUser, updateUserLocation,
  getSetting, setSetting, loadSettings,
  getCustomPois, addCustomPoiDB, clearCustomPoisDB,
  getLastAlertTime, getLastAlertTimeAny, recordAlert
};
