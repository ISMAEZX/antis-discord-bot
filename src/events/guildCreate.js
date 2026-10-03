const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'antis.db'));
db.pragma('journal_mode = WAL');

db.prepare(`
  CREATE TABLE IF NOT EXISTS guild_configs (
    guild_id TEXT PRIMARY KEY,
    log_channel_id TEXT,
    allowed_roles TEXT NOT NULL DEFAULT '[]',
    ignored_channels TEXT NOT NULL DEFAULT '[]',
    whitelist TEXT NOT NULL DEFAULT '[]',
    timeout_limit INTEGER NOT NULL DEFAULT 5,
    timeout_duration_minutes INTEGER NOT NULL DEFAULT 10,
    window_minutes INTEGER NOT NULL DEFAULT 10,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS infractions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`CREATE INDEX IF NOT EXISTS idx_infractions_lookup ON infractions(guild_id, user_id, created_at)`).run();

function parseJsonList(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function stringList(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function defaultConfig() {
  return {
    guild_id: null,
    log_channel_id: null,
    allowed_roles: [],
    ignored_channels: [],
    whitelist: [],
    timeout_limit: 5,
    timeout_duration_minutes: 10,
    window_minutes: 10
  };
}

function ensureGuildConfig(guildId) {
  const existing = db.prepare('SELECT * FROM guild_configs WHERE guild_id = ?').get(guildId);
  if (existing) {
    return {
      ...existing,
      allowed_roles: parseJsonList(existing.allowed_roles),
      ignored_channels: parseJsonList(existing.ignored_channels),
      whitelist: parseJsonList(existing.whitelist)
    };
  }

  const config = defaultConfig();
  config.guild_id = guildId;
  db.prepare(`INSERT INTO guild_configs (guild_id, log_channel_id, allowed_roles, ignored_channels, whitelist, timeout_limit, timeout_duration_minutes, window_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(guildId, null, stringList(config.allowed_roles), stringList(config.ignored_channels), stringList(config.whitelist), config.timeout_limit, config.timeout_duration_minutes, config.window_minutes);

  return getGuildConfig(guildId);
}

function getGuildConfig(guildId) {
  const row = db.prepare('SELECT * FROM guild_configs WHERE guild_id = ?').get(guildId);
  if (!row) return defaultConfig();

  return {
    ...row,
    allowed_roles: parseJsonList(row.allowed_roles),
    ignored_channels: parseJsonList(row.ignored_channels),
    whitelist: parseJsonList(row.whitelist)
  };
}

function saveGuildConfig(guildId, updates) {
  const config = ensureGuildConfig(guildId);
  const next = { ...config, ...updates };
  db.prepare(`UPDATE guild_configs SET log_channel_id = ?, allowed_roles = ?, ignored_channels = ?, whitelist = ?, timeout_limit = ?, timeout_duration_minutes = ?, window_minutes = ? WHERE guild_id = ?`)
    .run(
      next.log_channel_id,
      stringList(next.allowed_roles),
      stringList(next.ignored_channels),
      stringList(next.whitelist),
      next.timeout_limit,
      next.timeout_duration_minutes,
      next.window_minutes,
      guildId
    );
}

function setLogChannel(guildId, channelId) {
  const config = ensureGuildConfig(guildId);
  config.log_channel_id = channelId;
  saveGuildConfig(guildId, config);
}

function setGuildLimit(guildId, value) {
  const config = ensureGuildConfig(guildId);
  config.timeout_limit = Number(value);
  saveGuildConfig(guildId, config);
}

function setGuildTimeoutDuration(guildId, value) {
  const config = ensureGuildConfig(guildId);
  config.timeout_duration_minutes = Number(value);
  saveGuildConfig(guildId, config);
}

function setGuildWindow(guildId, value) {
  const config = ensureGuildConfig(guildId);
  config.window_minutes = Number(value);
  saveGuildConfig(guildId, config);
}

function getAllowedRoles(guildId) {
  return ensureGuildConfig(guildId).allowed_roles;
}

function addAllowedRole(guildId, roleId) {
  const config = ensureGuildConfig(guildId);
  if (!roleId) return false;
  const list = [...new Set(config.allowed_roles)];
  if (list.includes(roleId)) return false;
  list.push(roleId);
  config.allowed_roles = list;
  saveGuildConfig(guildId, config);
  return true;
}

function removeAllowedRole(guildId, roleId) {
  const config = ensureGuildConfig(guildId);
  if (!roleId) return false;
  const before = config.allowed_roles.length;
  config.allowed_roles = config.allowed_roles.filter((entry) => entry !== roleId);
  if (config.allowed_roles.length === before) return false;
  saveGuildConfig(guildId, config);
  return true;
}

function getIgnoredChannels(guildId) {
  return ensureGuildConfig(guildId).ignored_channels;
}

function addIgnoredChannel(guildId, channelId) {
  const config = ensureGuildConfig(guildId);
  if (!channelId) return false;
  const list = [...new Set(config.ignored_channels)];
  if (list.includes(channelId)) return false;
  list.push(channelId);
  config.ignored_channels = list;
  saveGuildConfig(guildId, config);
  return true;
}

function removeIgnoredChannel(guildId, channelId) {
  const config = ensureGuildConfig(guildId);
  if (!channelId) return false;
  const before = config.ignored_channels.length;
  config.ignored_channels = config.ignored_channels.filter((entry) => entry !== channelId);
  if (config.ignored_channels.length === before) return false;
  saveGuildConfig(guildId, config);
  return true;
}

function getWhitelist(guildId) {
  return ensureGuildConfig(guildId).whitelist;
}

function addWhitelistCode(guildId, code) {
  const config = ensureGuildConfig(guildId);
  if (!code) return false;
  const option = String(code).trim().toLowerCase();
  const list = [...new Set(config.whitelist.map((entry) => String(entry).trim().toLowerCase()))];
  if (list.includes(option)) return false;
  list.push(option);
  config.whitelist = list;
  saveGuildConfig(guildId, config);
  return true;
}

function removeWhitelistCode(guildId, code) {
  const config = ensureGuildConfig(guildId);
  if (!code) return false;
  const option = String(code).trim().toLowerCase();
  const before = config.whitelist.length;
  config.whitelist = config.whitelist.filter((entry) => String(entry).trim().toLowerCase() !== option);
  if (config.whitelist.length === before) return false;
  saveGuildConfig(guildId, config);
  return true;
}

function recordInfraction(guildId, userId, reason) {
  db.prepare(`INSERT INTO infractions (guild_id, user_id, reason, created_at) VALUES (?, ?, ?, ?)`).run(guildId, userId, reason, new Date().toISOString());
}

function getUserInfractions(guildId, userId, windowMinutes = 10) {
  const config = ensureGuildConfig(guildId);
  const minutes = Number(windowMinutes || config.window_minutes || 10);
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  return db.prepare(`SELECT * FROM infractions WHERE guild_id = ? AND user_id = ? AND created_at >= ? ORDER BY created_at DESC`).all(guildId, userId, since);
}

function clearInfractions(guildId, userId) {
  db.prepare(`DELETE FROM infractions WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
}

module.exports = {
  db,
  ensureGuildConfig,
  getGuildConfig,
  setLogChannel,
  setGuildLimit,
  setGuildTimeoutDuration,
  setGuildWindow,
  getAllowedRoles,
  addAllowedRole,
  removeAllowedRole,
  getIgnoredChannels,
  addIgnoredChannel,
  removeIgnoredChannel,
  getWhitelist,
  addWhitelistCode,
  removeWhitelistCode,
  recordInfraction,
  getUserInfractions,
  clearInfractions,
  saveGuildConfig
};
