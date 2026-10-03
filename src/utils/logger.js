function normalizeInviteText(value = '') {
  return String(value)
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function collectMessageText(message) {
  const parts = [];
  if (message.content) parts.push(message.content);
  for (const embed of message.embeds || []) {
    const values = [embed.title, embed.description];
    if (Array.isArray(embed.fields)) {
      for (const field of embed.fields) {
        values.push(field.name, field.value);
      }
    }
    parts.push(values.filter(Boolean).join(' '));
  }
  return parts.join('\n');
}

function findInviteCodes(message) {
  const text = collectMessageText(message);
  const normalized = normalizeInviteText(text);
  const codes = new Set();
  const patterns = [
    /(?:https?:\/\/)?discord(?:app)?\.com\/invite\/([a-z0-9-]+)/gi,
    /(?:https?:\/\/)?discord\.gg\/([a-z0-9-]+)/gi,
    /(?:https?:\/\/)?dsc\.gg\/([a-z0-9-]+)/gi,
    /(?:https?:\/\/)?\.gg\/([a-z0-9-]+)/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      if (match[1]) {
        codes.add(match[1]);
      }
    }
  }

  return [...codes];
}

async function isSameGuildInvite(code, guild) {
  if (!code || !guild) return false;
  const normalizedCode = String(code).trim().toLowerCase();
  if (!normalizedCode) return false;

  try {
    const invites = guild.invites.cache;
    const cacheMatch = invites.some((invite) => invite.code && invite.code.toLowerCase() === normalizedCode);
    if (cacheMatch) return true;
  } catch (error) { }

  try {
    const fetched = await guild.invites.fetch().catch(() => new Map());
    const fetchMatch = Array.from(fetched.values()).some((invite) => invite.code && invite.code.toLowerCase() === normalizedCode);
    if (fetchMatch) return true;
  } catch (error) { }

  const vanityCode = guild.vanityURLCode ? guild.vanityURLCode.toLowerCase() : null;
  return Boolean(vanityCode && vanityCode === normalizedCode);
}

module.exports = {
  normalizeInviteText,
  collectMessageText,
  findInviteCodes,
  isSameGuildInvite
};
