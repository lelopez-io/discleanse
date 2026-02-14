# Architecture

## How It Works

The tool will:
1. Connect to your server
2. Find all text channels, voice channels, and threads
3. Sort by message count (smallest first, "general" last)
4. For each channel: wipe threads first, then the channel, then delete
5. Print a summary

## Processing Strategy

1. **Fetch**: Gather all messages from all channels and threads
2. **Bulk delete**: Recent messages (<2 weeks) are bulk deleted across all targets
3. **Leaves first**: Delete old messages from threads (smallest first), then channels
4. **Cleanup**: Delete each channel after emptying it

Additional details:
- **Rate limiting**: Automatically handles Discord's rate limits
- **Old messages**: Deleted one by one (~1/sec due to API limits)
- **Threads**: Handles active and archived threads (public + private)

## Requirements

- [Bun](https://bun.sh) runtime
- You must be the server owner (or have a bot with Administrator permission)
