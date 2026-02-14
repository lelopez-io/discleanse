# Discord Setup

## Get Your Server ID

1. In Discord, enable Developer Mode (Settings → App Settings → Advanced → Developer Mode)
2. Right-click your server name → **Copy Server ID**
3. Paste into `.env` as `DISCORD_GUILD_ID`

## Create a Discord Bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application**, give it a name
3. Go to **Bot** section in the sidebar
4. Click **Reset Token** and copy it
5. Paste into `.env` as `DISCORD_TOKEN`

## Invite the Bot to Your Server

1. Go to **OAuth2** in the sidebar, scroll to **URL Generator**
2. Under **Scopes**, check `bot`
3. Under **Bot Permissions**, check `Administrator`
4. Copy the generated URL and open it
5. Select your server and authorize

## Ignore Channels

To skip specific channels, add their IDs to `.env`:

```
DISCORD_IGNORE_CHANNELS=123456789,987654321
```

Get a channel ID by right-clicking it in Discord (with Developer Mode enabled).
