// Message deletion logic - delete oldest first

import {
  getChannelMessages,
  deleteMessage,
  bulkDeleteMessages,
} from "../discord/client";
import type { Message, DeleteStats } from "../discord/types";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

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

export async function deleteChannelMessages(
  channelId: string,
  onProgress?: (bulk: number, individual: number) => void
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

  console.log(`  Old (>2 weeks): ${old.length}, Recent: ${recent.length}`);

  // Phase 3: Sort old by timestamp (oldest first)
  old.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Phase 4: Delete old messages individually (oldest first)
  if (old.length > 0) {
    console.log(`  Deleting old messages (oldest first)...`);
    for (const msg of old) {
      const deleted = await deleteMessage(channelId, msg.id);
      if (deleted) {
        individualDeleted += 1;
        onProgress?.(bulkDeleted, individualDeleted);
      }
    }
  }

  // Phase 5: Bulk delete recent messages in batches of 100
  if (recent.length > 0) {
    console.log(`  Bulk deleting recent messages...`);
    const batches = chunk(recent, 100);

    for (const batch of batches) {
      if (batch.length >= 2) {
        await bulkDeleteMessages(channelId, batch.map((m) => m.id));
        bulkDeleted += batch.length;
        onProgress?.(bulkDeleted, individualDeleted);
      } else if (batch.length === 1) {
        // Single message - delete individually
        const deleted = await deleteMessage(channelId, batch[0]!.id);
        if (deleted) {
          individualDeleted += 1;
          onProgress?.(bulkDeleted, individualDeleted);
        }
      }
    }
  }

  return {
    bulkDeleted,
    individualDeleted,
    timeMs: Date.now() - startTime,
  };
}
