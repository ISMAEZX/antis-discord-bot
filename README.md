# Antis

Antis is a Discord moderation bot built with Node.js and discord.js v14. It automatically deletes unauthorized invites to other Discord servers and keeps per-guild configuration in SQLite.

## Features

- Deletes unauthorized Discord server invite links in all channels, including text, threads, voice text chats, stage chats, forum/media posts, and new channels.
- Applies per-guild configuration stored in SQLite with better-sqlite3.
- Supports owner-only configuration commands.
- Logs moderation events to an optional guild log channel and a local debug log file.
- Detects invite links across message content and embeds.
- Ignores same-guild invites and vanity links.
- Enforces timeout escalation after repeated infractions.

## Requirements

- Node.js 18 or newer
- A Discord application and bot user
- A server where the bot can be invited

## Step 1: Create the Discord bot

1. Go to the Discord Developer Portal: https://discord.com/developers/applications
2. Click New Application.
3. Give the app a name such as Antis.
4. Go to the Bot tab.
5. Click Add Bot.
6. Copy the bot token and save it in a `.env` file.
7. Make sure the bot has the following privileged intents enabled under the Bot tab:
   - Server Members Intent
   - Message Content Intent

## Step 2: Create the environment file

Create a `.env` file in the project root based on `.env.example`:

```bash
DISCORD_TOKEN=your_discord_bot_token_here
```

## Step 3: Install dependencies

```bash
npm install
```

## Step 4: Invite the bot to a guild

Use the Discord OAuth2 URL generator or a direct URL with the required permissions:

- View Channels
- Send Messages
- Embed Links
- Manage Messages
- Moderate Members
- Manage Channels
- Send Messages in Threads

Invite URL example:

```text
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=402714560&scope=bot
```

Important:
- The bot's role must not be blocked by channel permission overrides.
- This includes voice channel permissions and thread/channel-specific permission overrides.
- If the bot cannot View Channel or Manage Messages in a channel, it cannot protect that channel and will warn the owner.

## Step 5: Start the bot

```bash
npm start
```

## Command usage

Prefix: `!`

Public command:
- `!help`

Owner-only commands:
- `!addrole @role`
- `!removerole @role`
- `!roles`
- `!setlog #channel`
- `!setlog create`
- `!setlog off`
- `!setlimit <number>`
- `!settime <minutes>`
- `!setwindow <minutes>`
- `!whitelist add <code>`
- `!whitelist remove <code>`
- `!whitelist list`
- `!ignorechannel #channel`
- `!unignorechannel #channel`
- `!ignored`
- `!infractions @user`
- `!status`

## Notes

- The bot starts in protection mode immediately after joining a server.
- There are no protected channel exceptions by default. The ignored channel list starts empty.
- Logging is optional and stored per guild in SQLite.
- Local debug logs are written to `logs/antis.log`.
- The bot is designed to never crash from unhandled errors; it logs them instead.
