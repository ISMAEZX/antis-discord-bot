const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { config: loadDotEnv } = require('dotenv');

loadDotEnv();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

const helpCommand = require('./src/commands/help');
client.commands.set(helpCommand.name, helpCommand);

const ownerCommands = require('./src/commands/owner');
for (const [name, command] of ownerCommands.commands) {
  client.commands.set(name, command);
}

const { ensureGuildConfig, getGuildConfig } = require('./src/db/database');
const { logInfo, logWarn, logError } = require('./src/utils/logger');
const { scanGuildModerationAccess, sendLogEmbed } = require('./src/utils/guildAccess');
const { findInviteCodes, isSameGuildInvite } = require('./src/utils/inviteDetector');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

const prefix = '!';

function isConfiguredForGuild(guildId) {
  const config = getGuildConfig(guildId);
  return Boolean(config && config.guild_id);
}

async function ensureGuildSetup(guild) {
  ensureGuildConfig(guild.id);
  await scanGuildModerationAccess(guild);
}

async function handleInviteMessage(message, wasEdit = false) {
  if (!message.guild || message.author.bot) return;
  if (!message.channel || !message.member) return;

  const config = ensureGuildConfig(message.guild.id);

  const ignoredChannels = Array.isArray(config.ignored_channels) ? config.ignored_channels : [];
  if (ignoredChannels.includes(message.channel.id)) {
    return;
  }

  const whitelistedCodes = Array.isArray(config.whitelist) ? config.whitelist : [];
  const detectedCodes = findInviteCodes(message);
  if (!detectedCodes.length) {
    return;
  }

  let allowed = false;
  for (const code of detectedCodes) {
    const normalizedCode = String(code || '').trim().toLowerCase();
    if (!normalizedCode) continue;
    if (whitelistedCodes.some((entry) => String(entry || '').trim().toLowerCase() === normalizedCode)) {
      allowed = true;
      break;
    }
    if (await isSameGuildInvite(normalizedCode, message.guild)) {
      allowed = true;
      break;
    }
  }

  if (allowed) {
    return;
  }

  const member = message.member;
  const ownerId = message.guild.ownerId;
  const isOwner = member.id === ownerId;
  const allowedRoles = Array.isArray(config.allowed_roles) ? config.allowed_roles : [];
  const memberHasAllowedRole = allowedRoles.some((roleId) => member.roles.cache.has(roleId));

  const botMember = message.guild.members.me || (await message.guild.members.fetchMe().catch(() => null));
  const botHighestRole = botMember?.roles?.highest?.position ?? 0;
  const hasHigherRole = member.roles.cache.some((role) => role.position > botHighestRole);

  if (isOwner || memberHasAllowedRole || hasHigherRole) {
    return;
  }

  const contentSnippet = (message.content || '').slice(0, 200).replace(/\s+/g, ' ') || 'No text content';
  const detectedLink = detectedCodes.join(', ');
  const currentCount = getCurrentInfractionCount(message.guild.id, member.id, config.window_minutes, config.timeout_limit);

  try {
    await message.delete();
  } catch (deleteError) {
    const embed = new EmbedBuilder()
      .setTitle('Failed action')
      .setColor(0xe74c3c)
      .addFields(
        { name: 'Type', value: 'Message deletion failed' },
        { name: 'User', value: `${member} (${member.id})` },
        { name: 'Channel', value: `${message.channel} (${message.channel.type})` },
        { name: 'Reason', value: String(deleteError.message || deleteError) }
      )
      .setTimestamp();
    await sendLogEmbed(message.guild, embed);
    logError(`[${message.guild.name}] Failed to delete unauthorized invite message.`, deleteError);
    return;
  }

  let warningMessage;
  try {
    warningMessage = await message.channel.send(`${member} you are not authorized to send links to other Discord servers here.`);
  } catch (warningError) {
    const embed = new EmbedBuilder()
      .setTitle('Failed action')
      .setColor(0xe74c3c)
      .addFields(
        { name: 'Type', value: 'Warning message failed' },
        { name: 'User', value: `${member} (${member.id})` },
        { name: 'Channel', value: `${message.channel} (${message.channel.type})` },
        { name: 'Reason', value: String(warningError.message || warningError) }
      )
      .setTimestamp();
    await sendLogEmbed(message.guild, embed);
    logError(`[${message.guild.name}] Failed to send warning in channel ${message.channel.id}.`, warningError);
  }

  if (warningMessage) {
    setTimeout(() => {
      warningMessage.delete().catch(() => {});
    }, 3500);
  }

  const infractionCount = recordInfractionForGuild(message.guild, member, detectedLink, contentSnippet, wasEdit);

  const logEmbed = new EmbedBuilder()
    .setTitle('Invite deleted')
    .setColor(0xffa500)
    .addFields(
      { name: 'User', value: `${member} (${member.id})` },
      { name: 'Channel', value: `${message.channel} (${message.channel.type})` },
      { name: 'Detected link', value: detectedLink },
      { name: 'Message snippet', value: contentSnippet },
      { name: 'Edited', value: wasEdit ? 'Yes' : 'No' },
      { name: 'Infraction count', value: `${infractionCount}/${config.timeout_limit}` }
    )
    .setTimestamp();

  await sendLogEmbed(message.guild, logEmbed);

  if (warningMessage) {
    const warningEmbed = new EmbedBuilder()
      .setTitle('Warning sent')
      .setColor(0xf1c40f)
      .addFields(
        { name: 'User', value: `${member} (${member.id})` },
        { name: 'Channel', value: `${message.channel} (${message.channel.type})` },
        { name: 'Infraction count', value: `${infractionCount}/${config.timeout_limit}` }
      )
      .setTimestamp();
    await sendLogEmbed(message.guild, warningEmbed);
  }

  const thresholdReached = infractionCount >= config.timeout_limit;
  if (thresholdReached) {
    await applyTimeoutForSpam(message.guild, member, config);
  }
}

function getCurrentInfractionCount(guildId, userId, windowMinutes, limit) {
  const { getUserInfractions } = require('./src/db/database');
  const history = getUserInfractions(guildId, userId, windowMinutes);
  return history.length;
}

function recordInfractionForGuild(guild, member, detectedLink, contentSnippet, wasEdit) {
  const { recordInfraction, getUserInfractions } = require('./src/db/database');
  const config = getGuildConfig(guild.id);
  const reason = `Unauthorized invite link: ${detectedLink}`;
  recordInfraction(guild.id, member.id, reason);
  const current = getUserInfractions(guild.id, member.id, config.window_minutes).length;
  return current;
}

async function applyTimeoutForSpam(guild, member, config) {
  const timeoutMs = (config.timeout_duration_minutes || 10) * 60 * 1000;
  const reason = `Spamming invites to other servers in ${guild.name} without permission.`;
  const timeoutReason = `Timed out for ${config.timeout_duration_minutes} minutes.`;

  try {
    await member.timeout(timeoutMs, reason);

    let dmDelivered = false;
    try {
      await member.send(`You have been timed out for ${config.timeout_duration_minutes} minutes for spamming invites to other servers in ${guild.name} without permission.`);
      dmDelivered = true;
    } catch (dmError) {
      const embed = new EmbedBuilder()
        .setTitle('Failed action')
        .setColor(0xe74c3c)
        .addFields(
          { name: 'Type', value: 'DM failed' },
          { name: 'User', value: `${member} (${member.id})` },
          { name: 'Reason', value: 'DM closed or blocked' }
        )
        .setTimestamp();
      await sendLogEmbed(guild, embed);
      logWarn(`[${guild.name}] DM failed for timed out user ${member.id}.`);
    }

    const { clearInfractions } = require('./src/db/database');
    clearInfractions(guild.id, member.id);

    const embed = new EmbedBuilder()
      .setTitle('Timeout applied')
      .setColor(0x2ecc71)
      .addFields(
        { name: 'User', value: `${member} (${member.id})` },
        { name: 'Duration', value: `${config.timeout_duration_minutes} minutes` },
        { name: 'DM delivered', value: dmDelivered ? 'Yes' : 'No' }
      )
      .setTimestamp();

    await sendLogEmbed(guild, embed);
  } catch (error) {
    const embed = new EmbedBuilder()
      .setTitle('Failed action')
      .setColor(0xe74c3c)
      .addFields(
        { name: 'Type', value: 'Timeout escalation failed' },
        { name: 'User', value: `${member} (${member.id})` },
        { name: 'Reason', value: String(error.message || error) }
      )
      .setTimestamp();
    await sendLogEmbed(guild, embed);
    logError(`[${guild.name}] Failed to timeout user ${member.id}.`, error);
  }
}

client.on('ready', async () => {
  logInfo(`Logged in as ${client.user.tag}`);
  client.user.setPresence({ activities: [{ name: '!help | Antis' }], status: 'online' });

  for (const guild of client.guilds.cache.values()) {
    await ensureGuildSetup(guild);
  }
});

client.on('guildCreate', async (guild) => {
  logInfo(`Joined guild: ${guild.name} (${guild.id})`);
  await ensureGuildSetup(guild);
});

client.on('channelUpdate', async (oldChannel, newChannel) => {
  if (!newChannel?.guild) return;
  await scanGuildModerationAccess(newChannel.guild);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  await handleInviteMessage(message, false);
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (newMessage.author.bot) return;
  await handleInviteMessage(newMessage, true);
});

client.on('messageCreate', async (message) => {
  if (!message.guild || !message.content || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName) return;

  const command = client.commands.get(commandName);
  if (!command) return;

  try {
    await command.execute(message, args);
  } catch (error) {
    logError(`Command error for ${commandName}: ${message.guild.name}`, error);
    message.reply('An internal error occurred while running that command.').catch(() => {});
  }
});

process.on('unhandledRejection', (error) => {
  logError('Unhandled rejection', error);
});

process.on('uncaughtException', (error) => {
  logError('Uncaught exception', error);
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  logError('DISCORD_TOKEN is missing. Set it in your .env file.');
  process.exit(1);
}

client.login(token).catch((error) => {
  logError('Failed to log in to Discord.', error);
  process.exit(1);
});
