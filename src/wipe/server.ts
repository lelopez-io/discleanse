// Server-wide orchestration - tree traversal (leaves first)

import {
  getGuild,
  getGuildChannels,
  getActiveThreads,
  getArchivedPublicThreads,
  getArchivedPrivateThreads,
} from "../discord/client";
import { estimateMessageCount, wipeChannel, wipeThreadMessages } from "./channel";
import {
  ChannelType,
  type Channel,
  type Thread,
} from "../discord/types";

interface ChannelWithEstimate {
  channel: Channel;
  estimate: number;
  threads: ThreadWithEstimate[];
}

interface ThreadWithEstimate {
  thread: Thread;
  estimate: number;
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
  console.log("  Fetching active threads...");
  const active = await getActiveThreads(guildId);
  threads.push(...active.threads);

  // Get archived threads for each text-based channel
  console.log("  Fetching archived threads...");
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
  // Validate access
  const guild = await getGuild(guildId);
  console.log(`\ndiscleanse - Starting...`);
  console.log(`Guild: ${guild.name} (${guild.id})\n`);

  // Get all text-based channels
  const allChannels = await getGuildChannels(guildId);
  const textChannels = allChannels.filter((c) => isTextBasedChannel(c.type));
  console.log(`Found ${textChannels.length} text-based channels`);

  // Fetch all threads
  const allThreads = await fetchAllThreads(guildId, textChannels);
  console.log(`Found ${allThreads.length} threads total\n`);

  // Build channel tree with threads
  console.log("Estimating message counts...");
  const channelTree: ChannelWithEstimate[] = [];

  for (const channel of textChannels) {
    const estimate = await estimateMessageCount(channel.id);

    // Get threads belonging to this channel
    const channelThreads = allThreads.filter((t) => t.parent_id === channel.id);
    const threadsWithEstimates: ThreadWithEstimate[] = [];

    for (const thread of channelThreads) {
      const threadEstimate = await estimateMessageCount(thread.id);
      threadsWithEstimates.push({ thread, estimate: threadEstimate });
    }

    // Sort threads by size (smallest first)
    threadsWithEstimates.sort((a, b) => a.estimate - b.estimate);

    channelTree.push({
      channel,
      estimate,
      threads: threadsWithEstimates,
    });
  }

  // Sort channels by size (smallest first), "general" last
  channelTree.sort((a, b) => {
    const aIsGeneral = a.channel.name.toLowerCase() === "general";
    const bIsGeneral = b.channel.name.toLowerCase() === "general";
    if (aIsGeneral && !bIsGeneral) return 1;
    if (!aIsGeneral && bIsGeneral) return -1;
    return a.estimate - b.estimate;
  });

  let totalMessages = 0;
  let totalThreads = 0;
  const startTime = Date.now();
  const totalChannels = channelTree.length;

  console.log("\nProcessing channels (leaves first)...\n");

  // Process each channel: threads first, then channel, then delete
  for (let i = 0; i < channelTree.length; i++) {
    const { channel, estimate, threads } = channelTree[i]!;
    const position = i + 1;

    console.log(
      `[${position}/${totalChannels}] #${channel.name} (est. ${estimate} msgs, ${threads.length} threads)`
    );

    // Step 1: Wipe threads (leaves) first
    for (let j = 0; j < threads.length; j++) {
      const { thread, estimate: threadEstimate } = threads[j]!;

      console.log(
        `  └─ Thread: ${thread.name} (est. ${threadEstimate} msgs)`
      );

      const threadStats = await wipeThreadMessages(
        thread.id,
        thread.name,
        (bulk, ind) => {
          process.stdout.write(`\r     Deleted: ${bulk} bulk, ${ind} individual`);
        }
      );

      process.stdout.write("\r" + " ".repeat(60) + "\r");
      const threadTotal = threadStats.bulkDeleted + threadStats.individualDeleted;
      console.log(
        `     Wiped ${threadTotal} messages in ${formatTime(threadStats.timeMs)}`
      );

      totalMessages += threadTotal;
      totalThreads++;
    }

    // Step 2: Wipe channel messages and delete channel
    const channelStats = await wipeChannel(
      channel.id,
      channel.name,
      (bulk, ind) => {
        process.stdout.write(`\r  Deleted: ${bulk} bulk, ${ind} individual`);
      }
    );

    process.stdout.write("\r" + " ".repeat(60) + "\r");
    const channelTotal = channelStats.bulkDeleted + channelStats.individualDeleted;
    console.log(`  Wiped ${channelTotal} messages`);
    console.log(`  Channel deleted`);
    console.log(`  Done in ${formatTime(channelStats.timeMs)}\n`);

    totalMessages += channelTotal;
  }

  // Final summary
  const totalTime = Date.now() - startTime;
  console.log("─".repeat(50));
  console.log(
    `Completed: ${totalMessages.toLocaleString()} messages, ${totalThreads} threads, ${totalChannels} channels in ${formatTime(totalTime)}`
  );
}
