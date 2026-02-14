# discleanse

CLI tool to cleanse a Discord server before leaving the platform. Deletes all messages, text channels, and voice channels.

This project uses [mise](https://mise.jdx.dev/) to manage Bun versions automatically.

## Quick Start

### System Dependencies

1. **Install mise for version management:**

```bash
brew install mise
```

2. **Add mise to your shell (add to your `~/.zshrc`):**

```bash
eval "$(mise activate zsh)"
```

3. **Restart your shell or source your config:**

```bash
source ~/.zshrc
```

### Project Setup

```bash
mise trust
mise run setup
cp .env.example .env
```

Then configure your `.env` with your Discord bot token and server ID. See [Discord Setup](docs/DISCORD_SETUP.md) for detailed instructions.

### Usage

```bash
bun run src/index.ts
```

---

## Additional Documentation

- [Discord Setup](docs/DISCORD_SETUP.md) - Bot creation, server ID, and configuration
- [Architecture](docs/ARCHITECTURE.md) - How the tool works and processing strategy

## License

MIT License - see LICENSE file.
