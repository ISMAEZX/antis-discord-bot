const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const { getGuildConfig, setLogChannel } = require('../db/database');
const { logWarn } = require('./logger');

function channelLabel(channel) {
  if (!channel) return 'Unknown channel';
  if (channel.isThread()) return `${channel.name} (thread)`;
  if (channel.type === 2) return `${channel.name} (voice chat)`;
  if (channel.type === 13) return `${channel.name} (stage chat)`;
  if (channel.type === 15) return `${channel.name} (forum)`;
  if (channel.type === 16) return `${channel.name} (announcement)`;
  if (channel.type === 0) return `${channel.name} (text)`;
  return `${channel.name} (${channel.type})`;
}

async function getGuildCoverageSummary(guild) {
  const channels = [];
  for (const channel of guild.channels.cache.values()) {
    channels.push(channel);
    if (channel.threads && channel.threads.cache) {
      for (const thread of channel.threads.cache.values()) {
        channels.push(thread);
      }
    }
  }

  const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!botMember) {
    return { total: channels.length, protected: 0, inaccessible: channels.length, inaccessibleChannels: channels };
  }

  let protectedCount = 0;
  const inaccessible = [];

  for (const channel of channels) {
    if (!channel) continue;
    const permissions = botMember.permissionsIn(channel);
    const canView = permissions.has(PermissionsBitField.Flags.ViewChannel);
    const canManage = permissions.has(PermissionsBitField.Flags.ManageMessages);
    if (canView && canManage) {
      protectedCount += 1;
    } else {
      inaccessible.push({
        channel,
        missing: [
          !canView ? 'View Channel' : null,
          !canManage ? 'Manage Messages' : null
        ].filter(Boolean)
      });
    }
  }

  return {
    total: channels.length,
    protected: protectedCount,
    inaccessible: inaccessible.length,
    inaccessibleChannels: inaccessible
  };
}

async function sendLogEmbed(guild, embed) {
  const config = getGuildConfig(guild.id);
  const channelId = config.log_channel_id;
  if (!channelId) {
    logWarn(`[${guild.name}] Log channel is missing. Use !setlog to set a new one.`);
    return false;
  }

  let channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    logWarn(`[${guild.name}] The log channel is missing. Use !setlog to set a new one.`);
    try {
      const owner = await guild.fetchOwner().catch(() => null);
      if (owner) {
        await owner.send('The log channel is missing. Use !setlog to set a new one.');
      }
    } catch (error) {
      logWarn(`[${guild.name}] Could not DM the owner about the missing log channel.`);
    }
    return false;
  }

  try {
    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    logWarn(`[${guild.name}] Failed to send log embedding: ${error.message || error}`);
    return false;
  }
}

async function scanGuildModerationAccess(guild) {
  const summary = await getGuildCoverageSummary(guild);
  if (summary.inaccessible > 0) {
    for (const item of summary.inaccessibleChannels) {
      const embed = new EmbedBuilder()
        .setTitle('Moderation access warning')
        .setColor(0xf1c40f)
        .addFields(
          { name: 'Channel', value: channelLabel(item.channel) },
          { name: 'Missing permissions', value: item.missing.join(', ') || 'Unknown' },
          { name: 'Guild', value: guild.name }
        )
        .setTimestamp();

      await sendLogEmbed(guild, embed);
      logWarn(`[${guild.name}] Channel ${channelLabel(item.channel)} is not fully protected. Missing: ${item.missing.join(', ') || 'unknown'}`);
    }
  }
  return summary;
}

module.exports = {
  channelLabel,
  getGuildCoverageSummary,
  sendLogEmbed,
  scanGuildModerationAccess
};
