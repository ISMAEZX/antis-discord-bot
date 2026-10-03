const { scanGuildModerationAccess } = require('../utils/guildAccess');

module.exports = {
  name: 'channelUpdate',
  async execute(oldChannel, newChannel) {
    if (!newChannel || !newChannel.guild) return;
    await scanGuildModerationAccess(newChannel.guild);
  }
};
