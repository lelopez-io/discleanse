# discleanse

CLI tool to cleanse a Discord server before leaving the platform. Deletes all messages and channels.

## Setup

### 1. Configure Environment

```bash
cp .env.example .env
```

### 2. Create a Discord Bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application**, give it a name
3. Go to **Bot** section in the sidebar
4. Click **Reset Token** and copy it
5. Paste into `.env` as `DISCORD_TOKEN`

### 3. Get Your Server ID

1. In Discord, enable Developer Mode (Settings → App Settings → Advanced → Developer Mode)
2. Right-click your server name → **Copy Server ID**
3. Paste into `.env` as `DISCORD_GUILD_ID`

### 4. Invite the Bot to Your Server

1. Back in the Discord Developer Portal, go to **OAuth2** in the sidebar
2. Scroll to **URL Generator**
3. Under **Scopes**, check `bot`
4. Under **Bot Permissions**, check `Administrator`
5. Copy the generated URL at the bottom
6. Open the URL in your browser and select your server

## Usage

```bash
bun run src/index.ts
```

The tool will:
1. Connect to your server
2. Find all text channels and threads
3. Sort by message count (smallest first, "general" last)
4. For each channel: wipe threads first, then the channel, then delete
5. Print a summary

## How It Works

- **Tree traversal**: Messages in threads → messages in channels → delete channels
- **Oldest first**: Old messages (>2 weeks) are deleted first, then recent ones
- **Bulk delete**: Recent messages (<2 weeks) are deleted in batches of 100
- **Individual delete**: Older messages are deleted one by one (~3/sec)
- **Rate limiting**: Automatically handles Discord's rate limits with retries
- **Threads**: Handles active and archived threads (public + private)

## Requirements

- [Bun](https://bun.sh) runtime
- You must be the server owner (or have a bot with Administrator permission)
