const { EmbedBuilder } = require('discord.js');
const { getGuildConfig, ensureGuildConfig, addAllowedRole, removeAllowedRole, addIgnoredChannel, removeIgnoredChannel, setLogChannel, addWhitelistCode, removeWhitelistCode, getAllowedRoles, getIgnoredChannels, getWhitelist, recordInfraction, getUserInfractions, clearInfractions, setGuildLimit, setGuildTimeoutDuration, setGuildWindow } = require('../db/database');
const { sendLogEmbed, getGuildCoverageSummary, channelLabel } = require('../utils/guildAccess');
const { logWarn, logInfo } = require('../utils/logger');

function isOwner(message) {
  return message.guild && message.guild.ownerId === message.author.id;
}

function ownerOnlyReply(message) {
  return message.reply('Only the server owner can use this command.');
}

function parseRoleIdFromMention(value) {
  if (!value) return null;
  const match = value.match(/<@&?(\d+)>/);
  if (match) return match[1];
  return value.replace(/[^\d]/g, '');
}

function parseChannelIdFromMention(value) {
  if (!value) return null;
  const match = value.match(/<#?(\d+)>/);
  if (match) return match[1];
  const clean = value.replace(/[^\d]/g, '');
  return clean || null;
}

function parseUserIdFromMention(value) {
  if (!value) return null;
  const match = value.match(/<@!?(
    \d+)>/);
  if (match) return match[1];
  return value.replace(/[^\d]/g, '');
}

async function logConfigChange(guild, actor, title, details) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x5865f2)
    .addFields(
      { name: 'Changed by', value: `${actor} (${actor.id})` },
      { name: 'Details', value: details }
    )
    .setTimestamp();
  await sendLogEmbed(guild, embed);
}

async function createOrReuseLogChannel(guild, actor) {
  const existing = guild.channels.cache.find((channel) => channel.name === 'logs-antis');
  if (existing) {
    const config = getGuildConfig(guild.id);
    setLogChannel(guild.id, existing.id);
    await logConfigChange(guild, actor, 'Log channel configured', `Reused existing channel: ${existing} (${existing.id})`);
    return existing;
  }

  const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  const botUserId = botMember?.user?.id || client.user.id;
  const owner = await guild.fetchOwner().catch(() => null);
  const allowedRoles = getAllowedRoles(guild.id);

  const permissionOverwrites = [
    { id: guild.roles.everyone, deny: ['ViewChannel'] },
    { id: botUserId, allow: ['ViewChannel', 'SendMessages', 'EmbedLinks'] },
  ];

  if (owner) permissionOverwrites.push({ id: owner.id, allow: ['ViewChannel', 'SendMessages', 'EmbedLinks'] });
  for (const roleId of allowedRoles) {
    const role = guild.roles.cache.get(roleId);
    if (role) permissionOverwrites.push({ id: role.id, allow: ['ViewChannel'] });
  }

  const channel = await guild.channels.create({
    name: 'logs-antis',
    type: 0,
    permissionOverwrites
  }).catch((error) => {
    logWarn(`[${guild.name}] Failed to create log channel: ${error.message || error}`);
    return null;
  });

  if (!channel) {
    return null;
  }

  setLogChannel(guild.id, channel.id);
  await logConfigChange(guild, actor, 'Log channel configured', `Created channel ${channel} (${channel.id})`);
  return channel;
}

const commands = new Map();

commands.set('addrole', {
  name: 'addrole',
  ownerOnly: true,
  async execute(message, args) {
    if (!isOwner(message)) return ownerOnlyReply(message);
    const roleId = parseRoleIdFromMention(args[0]);
    if (!roleId) return message.reply('Please mention a valid role.');

    const role = message.guild.roles.cache.get(roleId) || message.guild.roles.cache.find((entry) => entry.name.toLowerCase() === args.join(' ').toLowerCase());
    if (!role) return message.reply('That role does not exist in this guild.');

    const added = addAllowedRole(message.guild.id, role.id);
    if (!added) {
      return message.reply('That role is already in the allowed list.');
    }

    const embed = new EmbedBuilder().setTitle('Config changed').setColor(0x5865f2).addFields(
      { name: 'Action', value: 'Role added to allowed list' },
      { name: 'Role', value: `${role} (${role.id})` },
      { name: 'Changed by', value: `${message.author} (${message.author.id})` }
    ).setTimestamp();

    await sendLogEmbed(message.guild, embed);
    await message.reply(`Added ${role} to the allowed roles list.`);
  }
});

commands.set('removerole', {
  name: 'removerole',
  ownerOnly: true,
  async execute(message, args) {
    if (!isOwner(message)) return ownerOnlyReply(message);
    const roleId = parseRoleIdFromMention(args[0]);
    if (!roleId) return message.reply('Please mention a valid role.');

    const role = message.guild.roles.cache.get(roleId);
    if (!role) return message.reply('That role does not exist in this guild.');

    const removed = removeAllowedRole(message.guild.id, role.id);
    if (!removed) return message.reply('That role was not in the allowed list.');

    const embed = new EmbedBuilder().setTitle('Config changed').setColor(0x5865f2).addFields(
      { name: 'Action', value: 'Role removed from allowed list' },
      { name: 'Role', value: `${role} (${role.id})` },
      { name: 'Changed by', value: `${message.author} (${message.author.id})` }
    ).setTimestamp();

    await sendLogEmbed(message.guild, embed);
    await message.reply(`Removed ${role} from the allowed roles list.`);
  }
});

commands.set('roles', {
  name: 'roles',
  ownerOnly: true,
  async execute(message) {
    if (!isOwner(message)) return ownerOnlyReply(message);
    const roles = getAllowedRoles(message.guild.id);
    if (!roles.length) {
      return message.reply('No roles are currently allowed.');
    }

    const list = roles.map((roleId) => {
      return message.guild.roles.cache.get(roleId)?.toString() || `Unknown role (${roleId})`;
    }).join(', ');

    const embed = new EmbedBuilder().setTitle('Allowed roles').setColor(0x5865f2).setDescription(list).setTimestamp();
    await message.reply({ embeds: [embed] });
  }
});

commands.set('setlog', {
  name: 'setlog',
  ownerOnly: true,
  async execute(message, args) {
    if (!isOwner(message)) return ownerOnlyReply(message);
    const mode = (args[0] || '').toLowerCase();

    if (!mode) {
      return message.reply('Usage: `!setlog #channel`, `!setlog create`, or `!setlog off`');
    }

    if (mode === 'off') {
      setLogChannel(message.guild.id, null);
      await logConfigChange(message.guild, message.author, 'Log channel updated', 'Logging disabled.');
      await message.reply('Logging has been disabled for this guild.');
      return;
    }

    if (mode === 'create') {
      const channel = await createOrReuseLogChannel(message.guild, message.author);
      if (!channel) {
        return message.reply('The bot could not create a log channel. Check permissions and channel settings.');
      }
      await message.reply(`The log channel is now set to ${channel}.`);
      return;
    }

    const channelId = parseChannelIdFromMention(mode);
    const channel = channelId ? message.guild.channels.cache.get(channelId) || await message.guild.channels.fetch(channelId).catch(() => null) : null;

    if (!channel || !channel.isTextBased()) {
      return message.reply('Please mention a valid text channel or use `!setlog create`.');
    }

    setLogChannel(message.guild.id, channel.id);
    await logConfigChange(message.guild, message.author, 'Log channel updated', `Set to ${channel} (${channel.id}).`);
    await message.reply(`The log channel is now set to ${channel}.`);
  }
});

commands.set('setlimit', {
  name: 'setlimit',
  ownerOnly: true,
  async execute(message, args) {
    if (!isOwner(message)) return ownerOnlyReply(message);
    const value = Number(args[0]);
    if (!Number.isInteger(value) || value < 1) return message.reply('Please give a valid whole number greater than zero.');
    setGuildLimit(message.guild.id, value);
    await logConfigChange(message.guild, message.author, 'Config changed', `Timeout threshold set to ${value}.`);
    await message.reply(`The timeout threshold is now set to ${value}.`);
  }
});

commands.set('settime', {
  name: 'settime',
  ownerOnly: true,
  async execute(message, args) {
    if (!isOwner(message)) return ownerOnlyReply(message);
    const value = Number(args[0]);
    if (!Number.isInteger(value) || value < 1) return message.reply('Please give a valid timeout duration in minutes.');
    setGuildTimeoutDuration(message.guild.id, value);
    await logConfigChange(message.guild, message.author, 'Config changed', `Timeout duration set to ${value} minutes.`);
    await message.reply(`The timeout duration is now set to ${value} minutes.`);
  }
});

commands.set('setwindow', {
  name: 'setwindow',
  ownerOnly: true,
  async execute(message, args) {
    if (!isOwner(message)) return ownerOnlyReply(message);
    const value = Number(args[0]);
    if (!Number.isInteger(value) || value < 1) return message.reply('Please give a valid infraction time window in minutes.');
    setGuildWindow(message.guild.id, value);
    await logConfigChange(message.guild, message.author, 'Config changed', `Infraction window set to ${value} minutes.`);
    await message.reply(`The infraction window is now set to ${value} minutes.`);
  }
});

commands.set('whitelist', {
  name: 'whitelist',
  ownerOnly: true,
  async execute(message, args) {
    if (!isOwner(message)) return ownerOnlyReply(message);
    const action = (args[0] || '').toLowerCase();
    const code = (args[1] || '').trim();

    if (!action) {
      return message.reply('Usage: `!whitelist add <code>`, `!whitelist remove <code>`, or `!whitelist list`');
    }

    if (action === 'list') {
      const values = getWhitelist(message.guild.id);
      if (!values.length) return message.reply('No invite codes are whitelisted for this guild.');
      return message.reply(`Whitelisted invite codes: ${values.join(', ')}`);
    }

    if (!code) {
      return message.reply('Please provide an invite code.');
    }

    const cleanedCode = code.toLowerCase().replace(/[^a-z0-9-]/gi, '');
    if (!cleanedCode) return message.reply('Please provide a valid invite code.');

    if (action === 'add') {
      const added = addWhitelistCode(message.guild.id, cleanedCode);
      if (!added) return message.reply('That invite code is already whitelisted.');
      await logConfigChange(message.guild, message.author, 'Config changed', `Whitelisted invite code: ${cleanedCode}`);
      return message.reply(`Added invite code ${cleanedCode} to the whitelist.`);
    }

    if (action === 'remove') {
      const removed = removeWhitelistCode(message.guild.id, cleanedCode);
      if (!removed) return message.reply('That invite code is not on the whitelist.');
      await logConfigChange(message.guild, message.author, 'Config changed', `Removed invite code: ${cleanedCode}`);
      return message.reply(`Removed invite code ${cleanedCode} from the whitelist.`);
    }

    return message.reply('Usage: `!whitelist add <code>`, `!whitelist remove <code>`, or `!whitelist list`');
  }
});

commands.set('ignorechannel', {
  name: 'ignorechannel',
  ownerOnly: true,
  async execute(message, args) {
    if (!isOwner(message)) return ownerOnlyReply(message);
    const channelId = parseChannelIdFromMention(args[0]);
    if (!channelId) return message.reply('Please mention a valid channel.');
    const channel = message.guild.channels.cache.get(channelId) || await message.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return message.reply('That channel could not be found in this guild.');

    const added = addIgnoredChannel(message.guild.id, channel.id);
    if (!added) return message.reply('That channel is already ignored.');

    await logConfigChange(message.guild, message.author, 'Config changed', `Ignored channel: ${channelLabel(channel)} (${channel.id})`);
    await message.reply(`Added ${channel} to the ignored channel list.`);
  }
});

commands.set('unignorechannel', {
  name: 'unignorechannel',
  ownerOnly: true,
  async execute(message, args) {
    if (!isOwner(message)) return ownerOnlyReply(message);
    const channelId = parseChannelIdFromMention(args[0]);
    if (!channelId) return message.reply('Please mention a valid channel.');
    const channel = message.guild.channels.cache.get(channelId) || await message.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return message.reply('That channel could not be found in this guild.');

    const removed = removeIgnoredChannel(message.guild.id, channel.id);
    if (!removed) return message.reply('That channel is not ignored.');

    await logConfigChange(message.guild, message.author, 'Config changed', `Removed ignored channel: ${channelLabel(channel)} (${channel.id})`);
    await message.reply(`Removed ${channel} from the ignored channel list.`);
  }
});

commands.set('ignored', {
  name: 'ignored',
  ownerOnly: true,
  async execute(message) {
    if (!isOwner(message)) return ownerOnlyReply(message);
    const ignored = getIgnoredChannels(message.guild.id);
    if (!ignored.length) return message.reply('No channels are currently ignored.');

    const names = ignored.map((id) => {
      const channel = message.guild.channels.cache.get(id) || message.guild.channels.resolve(id);
      return channel ? `${channel.name} (${id})` : `Unknown channel (${id})`;
    }).join(', ');

    return message.reply(`Ignored channels: ${names}`);
  }
});

commands.set('infractions', {
  name: 'infractions',
  ownerOnly: true,
  async execute(message, args) {
    if (!isOwner(message)) return ownerOnlyReply(message);
    const userId = parseUserIdFromMention(args[0]);
    if (!userId) return message.reply('Please mention a user.');
    const user = await message.guild.members.fetch(userId).catch(() => null);
    const member = user || message.mentions.members?.first() || null;
    if (!member) return message.reply('That user could not be found.');

    const config = getGuildConfig(message.guild.id);
    const history = getUserInfractions(message.guild.id, member.id, config.window_minutes);
    const count = history.length;
    const embed = new EmbedBuilder().setTitle('Infraction summary').setColor(0x5865f2).addFields(
      { name: 'User', value: `${member} (${member.id})` },
      { name: 'Current count', value: String(count) },
      { name: 'Window', value: `${config.window_minutes} minutes` }
    ).setTimestamp();

    await message.reply({ embeds: [embed] });
  }
});

commands.set('status', {
  name: 'status',
  ownerOnly: true,
  async execute(message) {
    if (!isOwner(message)) return ownerOnlyReply(message);
    const config = getGuildConfig(message.guild.id);
    const { getGuildCoverageSummary } = require('../utils/guildAccess');
    const summary = await getGuildCoverageSummary(message.guild);
    const roleList = getAllowedRoles(message.guild.id).map((roleId) => message.guild.roles.cache.get(roleId)?.toString() || `Unknown role (${roleId})`).join(', ') || 'None';
    const ignored = getIgnoredChannels(message.guild.id).map((id) => message.guild.channels.cache.get(id)?.toString() || `Unknown channel (${id})`).join(', ') || 'None';
    const logChannel = config.log_channel_id ? message.guild.channels.cache.get(config.log_channel_id)?.toString() || `Unknown channel (${config.log_channel_id})` : 'Not set';

    const embed = new EmbedBuilder()
      .setTitle('Antis status')
      .setColor(0x5865f2)
      .addFields(
        { name: 'Log channel', value: logChannel },
        { name: 'Allowed roles', value: roleList },
        { name: 'Ignored channels', value: ignored },
        { name: 'Whitelist', value: (getWhitelist(message.guild.id).join(', ') || 'None') },
        { name: 'Timeout threshold', value: String(config.timeout_limit) },
        { name: 'Timeout duration', value: `${config.timeout_duration_minutes} minutes` },
        { name: 'Window', value: `${config.window_minutes} minutes` },
        { name: 'Protected channels', value: String(summary.protected) },
        { name: 'Inaccessible channels', value: String(summary.inaccessible) }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
});

module.exports = { commands };
