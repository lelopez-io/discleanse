// Server-wide orchestration - three-pass approach
// Pass 1: Bulk delete recent messages in ALL channels (fast)
// Pass 2: Individual delete old messages (slow, leaves first: small threads → small channels)
// Pass 3: Delete all channels

import {
  getGuild,
  getGuildChannels,
  getActiveThreads,
  getArchivedPublicThreads,
  getArchivedPrivateThreads,
  deleteChannel,
  unarchiveThread,
} from "../discord/client";
import {
  fetchChannelMessages,
  bulkDeleteRecent,
  deleteOldMessages,
  DELETE_DELAY_MS,
  type ChannelMessages,
} from "./message";
import { ChannelType, type Channel, type Thread } from "../discord/types";

interface ChannelData {
  id: string;
  name: string;
  isThread: boolean;
  parentId?: string;
  messages?: ChannelMessages;
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function isTextBasedChannel(type: number): boolean {
  return (
    type === ChannelType.GUILD_TEXT ||
    type === ChannelType.GUILD_ANNOUNCEMENT ||
    type === ChannelType.GUILD_FORUM
  );
}

async function fetchAllThreads(
  guildId: string,
  channels: Channel[]
): Promise<Thread[]> {
  const threads: Thread[] = [];

  // Get active threads
  const active = await getActiveThreads(guildId);
  threads.push(...active.threads);

  // Get archived threads for each text-based channel
  for (const channel of channels) {
    try {
      const publicArchived = await getArchivedPublicThreads(channel.id);
      threads.push(...publicArchived.threads);
    } catch {
      // Channel may not support threads
    }

    try {
      const privateArchived = await getArchivedPrivateThreads(channel.id);
      threads.push(...privateArchived.threads);
    } catch {
      // Channel may not support threads or bot lacks permission
    }
  }

  return threads;
}

export async function cleanseServer(guildId: string): Promise<void> {
  const startTime = Date.now();

  // Validate access
  const guild = await getGuild(guildId);
  console.log(`\ndiscleanse - Starting...`);
  console.log(`Guild: ${guild.name} (${guild.id})\n`);

  // Get all text-based channels
  const allChannels = await getGuildChannels(guildId);
  const textChannels = allChannels.filter((c) => isTextBasedChannel(c.type));
  console.log(`Found ${textChannels.length} text-based channels`);

  // Fetch all threads
  console.log(`Fetching threads...`);
  const allThreads = await fetchAllThreads(guildId, textChannels);
  console.log(`Found ${allThreads.length} threads\n`);

  // Build flat list of all channels + threads
  const allTargets: ChannelData[] = [];

  for (const channel of textChannels) {
    allTargets.push({
      id: channel.id,
      name: `#${channel.name}`,
      isThread: false,
    });
  }

  for (const thread of allThreads) {
    // Unarchive thread first
    try {
      await unarchiveThread(thread.id);
    } catch {
      // May already be unarchived
    }

    allTargets.push({
      id: thread.id,
      name: `  └─ ${thread.name}`,
      isThread: true,
      parentId: thread.parent_id,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: Fetch all messages
  // ═══════════════════════════════════════════════════════════════════
  console.log(`${"═".repeat(60)}`);
  console.log(`PHASE 1: Fetching messages from ${allTargets.length} channels/threads`);
  console.log(`${"═".repeat(60)}\n`);

  let totalRecent = 0;
  let totalOld = 0;

  for (let i = 0; i < allTargets.length; i++) {
    const target = allTargets[i]!;
    process.stdout.write(`[${i + 1}/${allTargets.length}] ${target.name}...`);

    target.messages = await fetchChannelMessages(target.id, target.name);
    const { recent, old } = target.messages;

    totalRecent += recent.length;
    totalOld += old.length;

    process.stdout.write(` ${recent.length} recent, ${old.length} old\n`);
  }

  console.log(`\nTotal: ${totalRecent} recent (bulk), ${totalOld} old (individual)`);
  const eta = formatEta(totalOld * (DELETE_DELAY_MS / 1000));
  console.log(`ETA for old messages: ${eta}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2: Bulk delete recent messages (fast!)
  // ═══════════════════════════════════════════════════════════════════
  console.log(`${"═".repeat(60)}`);
  console.log(`PHASE 2: Bulk deleting ${totalRecent} recent messages`);
  console.log(`${"═".repeat(60)}\n`);

  let bulkDeleted = 0;

  for (const target of allTargets) {
    if (!target.messages || target.messages.recent.length === 0) continue;

    const { recent } = target.messages;
    process.stdout.write(`${target.name}: `);

    const deleted = await bulkDeleteRecent(target.id, recent, (count) => {
      process.stdout.write(`\r${target.name}: ${count}/${recent.length}`);
    });

    bulkDeleted += deleted;
    process.stdout.write(`\r${target.name}: ${deleted} deleted\n`);
  }

  console.log(`\nBulk phase complete: ${bulkDeleted} messages deleted\n`);

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3: Individual delete old messages (slow, leaves first)
  // ═══════════════════════════════════════════════════════════════════
  console.log(`${"═".repeat(60)}`);
  console.log(`PHASE 3: Deleting ${totalOld} old messages individually (threads first)`);
  console.log(`${"═".repeat(60)}\n`);

  let individualDeleted = 0;
  let remainingTotal = totalOld;

  // Leaves first: threads sorted by old count (smallest first), then channels sorted by old count
  const threads = allTargets
    .filter((t) => t.isThread)
    .sort((a, b) => (a.messages?.old.length ?? 0) - (b.messages?.old.length ?? 0));
  const channels = allTargets
    .filter((t) => !t.isThread)
    .sort((a, b) => (a.messages?.old.length ?? 0) - (b.messages?.old.length ?? 0));

  for (const target of [...threads, ...channels]) {
    if (!target.messages || target.messages.old.length === 0) continue;

    const { old } = target.messages;

    const deleted = await deleteOldMessages(target.id, old, (count, remaining) => {
      const globalRemaining = remainingTotal - count;
      const etaStr = formatEta(globalRemaining * (DELETE_DELAY_MS / 1000));
      process.stdout.write(
        `\r${target.name}: ${count}/${old.length} | Total remaining: ${globalRemaining} | ETA: ${etaStr}   `
      );
    });

    individualDeleted += deleted;
    remainingTotal -= deleted;
    process.stdout.write(`\r${target.name}: ${deleted} deleted${" ".repeat(40)}\n`);
  }

  console.log(`\nIndividual phase complete: ${individualDeleted} messages deleted\n`);

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 4: Delete channels (threads auto-deleted with parent)
  // ═══════════════════════════════════════════════════════════════════
  console.log(`${"═".repeat(60)}`);
  console.log(`PHASE 4: Deleting ${textChannels.length} channels`);
  console.log(`${"═".repeat(60)}\n`);

  for (const channel of textChannels) {
    await deleteChannel(channel.id);
    console.log(`Deleted #${channel.name}`);
  }

  // Final summary
  const totalTime = Date.now() - startTime;
  const totalMessages = bulkDeleted + individualDeleted;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`COMPLETE`);
  console.log(`${"═".repeat(60)}`);
  console.log(`Messages: ${totalMessages.toLocaleString()} (${bulkDeleted} bulk + ${individualDeleted} individual)`);
  console.log(`Channels: ${textChannels.length} deleted`);
  console.log(`Threads: ${allThreads.length} deleted`);
  console.log(`Time: ${formatTime(totalTime)}`);
}
