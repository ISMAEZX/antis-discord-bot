const { scanGuildModerationAccess } = require('../utils/guildAccess');
const { ensureGuildConfig } = require('../db/database');

module.exports = {
  name: 'guildCreate',
  async execute(guild) {
    ensureGuildConfig(guild.id);
    await scanGuildModerationAccess(guild);
  }
};
