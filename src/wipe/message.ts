// Message deletion logic - bulk delete first, then old messages

import {
  getChannelMessages,
  deleteMessage,
  bulkDeleteMessages,
} from "../discord/client";
import type { Message, DeleteStats } from "../discord/types";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const DELETE_DELAY_MS = 1100; // ~1/sec for individual deletes

function isOlderThanTwoWeeks(message: Message): boolean {
  const messageDate = new Date(message.timestamp).getTime();
  const twoWeeksAgo = Date.now() - TWO_WEEKS_MS;
  return messageDate < twoWeeksAgo;
}

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export async function deleteChannelMessages(
  channelId: string,
  onProgress?: (bulk: number, individual: number, eta: string) => void
): Promise<DeleteStats> {
  const startTime = Date.now();
  let bulkDeleted = 0;
  let individualDeleted = 0;

  // Phase 1: Fetch ALL messages
  console.log(`  Fetching all messages...`);
  const allMessages: Message[] = [];
  let lastMessageId: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const batch = await getChannelMessages(channelId, lastMessageId);

    if (batch.length === 0) {
      break;
    }

    allMessages.push(...batch);
    lastMessageId = batch[batch.length - 1]?.id;

    if (batch.length < 100) {
      hasMore = false;
    }
  }

  console.log(`  Found ${allMessages.length} messages total`);

  if (allMessages.length === 0) {
    return { bulkDeleted: 0, individualDeleted: 0, timeMs: Date.now() - startTime };
  }

  // Phase 2: Split by age
  const old: Message[] = [];
  const recent: Message[] = [];

  for (const msg of allMessages) {
    if (isOlderThanTwoWeeks(msg)) {
      old.push(msg);
    } else {
      recent.push(msg);
    }
  }

  console.log(`  Recent (<2 weeks): ${recent.length}, Old: ${old.length}`);

  // Calculate ETA based on old messages (bulk is fast, old is slow)
  const estimatedSeconds = old.length * (DELETE_DELAY_MS / 1000);
  console.log(`  ETA: ${formatEta(estimatedSeconds)} (for ${old.length} old messages)`);

  // Phase 3: Bulk delete recent messages first (fast!)
  if (recent.length > 0) {
    console.log(`  Bulk deleting recent messages...`);
    const batches = chunk(recent, 100);

    for (const batch of batches) {
      if (batch.length >= 2) {
        await bulkDeleteMessages(channelId, batch.map((m) => m.id));
        bulkDeleted += batch.length;
        const remainingOld = old.length;
        const eta = formatEta(remainingOld * (DELETE_DELAY_MS / 1000));
        onProgress?.(bulkDeleted, individualDeleted, eta);
      } else if (batch.length === 1) {
        const deleted = await deleteMessage(channelId, batch[0]!.id);
        if (deleted) {
          individualDeleted += 1;
          onProgress?.(bulkDeleted, individualDeleted, "");
        }
      }
    }
  }

  // Phase 4: Delete old messages individually
  if (old.length > 0) {
    console.log(`  Deleting old messages individually...`);
    for (let i = 0; i < old.length; i++) {
      const msg = old[i]!;
      const deleted = await deleteMessage(channelId, msg.id);
      if (deleted) {
        individualDeleted += 1;
        const remaining = old.length - (i + 1);
        const eta = formatEta(remaining * (DELETE_DELAY_MS / 1000));
        onProgress?.(bulkDeleted, individualDeleted, eta);
      }
    }
  }

  return {
    bulkDeleted,
    individualDeleted,
    timeMs: Date.now() - startTime,
  };
}
