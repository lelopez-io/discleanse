// Server-wide orchestration

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
  type ChannelStats,
} from "../discord/types";

interface ChannelWithEstimate {
  channel: Channel;
  estimate: number;
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
  // Validate access
  const guild = await getGuild(guildId);
  console.log(`\ndiscleanse - Starting...`);
  console.log(`Guild: ${guild.name} (${guild.id})`);

  // Get all text-based channels
  const allChannels = await getGuildChannels(guildId);
  const textChannels = allChannels.filter((c) => isTextBasedChannel(c.type));

  console.log(`Found ${textChannels.length} text-based channels`);

  // Fetch all threads
  console.log("Fetching threads...");
  const allThreads = await fetchAllThreads(guildId, textChannels);
  console.log(`Found ${allThreads.length} threads\n`);

  let totalMessages = 0;
  let totalThreads = 0;
  const startTime = Date.now();

  // Phase 1: Wipe thread messages (threads are deleted with parent channel)
  if (allThreads.length > 0) {
    console.log("Phase 1: Wiping threads...\n");

    const threadsWithEstimates: ThreadWithEstimate[] = [];
    for (const thread of allThreads) {
      const estimate = await estimateMessageCount(thread.id);
      threadsWithEstimates.push({ thread, estimate });
    }

    // Sort by estimate (ascending)
    threadsWithEstimates.sort((a, b) => a.estimate - b.estimate);

    for (let i = 0; i < threadsWithEstimates.length; i++) {
      const { thread, estimate } = threadsWithEstimates[i]!;
      const position = i + 1;

      console.log(
        `[${position}/${allThreads.length}] Thread: ${thread.name} (est. ${estimate} messages)`
      );

      const stats = await wipeThreadMessages(thread.id, thread.name, (bulk, ind) => {
        process.stdout.write(`\r  Deleted: ${bulk} bulk, ${ind} individual`);
      });

      process.stdout.write("\r" + " ".repeat(50) + "\r");
      console.log(`  Bulk deleted: ${stats.bulkDeleted}`);
      console.log(`  Individual deleted: ${stats.individualDeleted}`);
      console.log(`  Done in ${formatTime(stats.timeMs)}\n`);

      totalMessages += stats.bulkDeleted + stats.individualDeleted;
      totalThreads++;
    }
  }

  // Phase 2: Wipe and delete channels
  if (textChannels.length === 0) {
    console.log("No text channels to cleanse.");
  } else {
    console.log("Phase 2: Wiping and deleting channels...\n");

    const channelsWithEstimates: ChannelWithEstimate[] = [];
    for (const channel of textChannels) {
      const estimate = await estimateMessageCount(channel.id);
      channelsWithEstimates.push({ channel, estimate });
    }

    // Sort by estimate (ascending) but keep "general" for last
    channelsWithEstimates.sort((a, b) => {
      const aIsGeneral = a.channel.name.toLowerCase() === "general";
      const bIsGeneral = b.channel.name.toLowerCase() === "general";
      if (aIsGeneral && !bIsGeneral) return 1;
      if (!aIsGeneral && bIsGeneral) return -1;
      return a.estimate - b.estimate;
    });

    const totalChannels = channelsWithEstimates.length;

    for (let i = 0; i < channelsWithEstimates.length; i++) {
      const { channel, estimate } = channelsWithEstimates[i]!;
      const position = i + 1;

      console.log(
        `[${position}/${totalChannels}] #${channel.name} (est. ${estimate} messages)`
      );

      const stats = await wipeChannel(channel.id, channel.name, (bulk, ind) => {
        process.stdout.write(`\r  Deleted: ${bulk} bulk, ${ind} individual`);
      });

      process.stdout.write("\r" + " ".repeat(50) + "\r");
      console.log(`  Bulk deleted: ${stats.bulkDeleted}`);
      console.log(`  Individual deleted: ${stats.individualDeleted}`);
      console.log(`  Channel deleted`);
      console.log(`  Done in ${formatTime(stats.timeMs)}\n`);

      totalMessages += stats.bulkDeleted + stats.individualDeleted;
    }
  }

  // Final summary
  const totalTime = Date.now() - startTime;
  console.log("─".repeat(50));
  console.log(
    `Completed: ${totalMessages.toLocaleString()} messages, ${totalThreads} threads, ${textChannels.length} channels deleted in ${formatTime(totalTime)}`
  );
}
