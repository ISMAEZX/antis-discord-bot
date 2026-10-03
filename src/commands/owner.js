const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'help',
  description: 'Show the list of available commands.',
  async execute(message) {
    const embed = new EmbedBuilder()
      .setTitle('Antis Help')
      .setColor(0x5865f2)
      .setDescription('Antis automatically removes unauthorized invites to other Discord servers.')
      .addFields(
        { name: '!help', value: 'Show this help menu.' },
        { name: '!addrole @role', value: 'Owner only. Add a role to the allowed list.', inline: false },
        { name: '!removerole @role', value: 'Owner only. Remove a role from the allowed list.', inline: false },
        { name: '!roles', value: 'Owner only. Show allowed roles.', inline: false },
        { name: '!setlog #channel', value: 'Owner only. Set the log channel.', inline: false },
        { name: '!setlog create', value: 'Owner only. Create or reuse the logs-antis channel.', inline: false },
        { name: '!setlog off', value: 'Owner only. Disable log channel output.', inline: false },
        { name: '!setlimit <number>', value: 'Owner only. Set the threshold for timeout escalation.', inline: false },
        { name: '!settime <minutes>', value: 'Owner only. Set the timeout duration in minutes.', inline: false },
        { name: '!setwindow <minutes>', value: 'Owner only. Set the infraction time window in minutes.', inline: false },
        { name: '!whitelist add <code>', value: 'Owner only. Allow a specific invite code for everyone.', inline: false },
        { name: '!whitelist remove <code>', value: 'Owner only. Remove a whitelist entry.', inline: false },
        { name: '!whitelist list', value: 'Owner only. List allowed invite codes.', inline: false },
        { name: '!ignorechannel #channel', value: 'Owner only. Allow invites in a specific channel.', inline: false },
        { name: '!unignorechannel #channel', value: 'Owner only. Remove a channel from the ignore list.', inline: false },
        { name: '!ignored', value: 'Owner only. Show ignored channels.', inline: false },
        { name: '!infractions @user', value: 'Owner only. Show a user infraction count.', inline: false },
        { name: '!status', value: 'Owner only. Show the current guild configuration and coverage summary.', inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};
