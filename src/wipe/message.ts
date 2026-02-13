// Message deletion logic - separate phases for bulk vs individual

import {
  getChannelMessages,
  deleteMessage,
  bulkDeleteMessages,
} from "../discord/client";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
export const DELETE_DELAY_MS = 1100; // ~1/sec for individual deletes

// Minimal data we need - just ID and timestamp, nothing else
interface MessageRef {
  id: string;
  timestamp: number;
}

function isOlderThanTwoWeeks(timestamp: number): boolean {
  const twoWeeksAgo = Date.now() - TWO_WEEKS_MS;
  return timestamp < twoWeeksAgo;
}

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export interface ChannelMessages {
  channelId: string;
  channelName: string;
  recent: MessageRef[];
  old: MessageRef[];
}

// Phase 1: Fetch all messages and categorize by age
// Only keeps id + timestamp in memory, discards everything else
export async function fetchChannelMessages(
  channelId: string,
  channelName: string
): Promise<ChannelMessages> {
  const old: MessageRef[] = [];
  const recent: MessageRef[] = [];
  let lastMessageId: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const batch = await getChannelMessages(channelId, lastMessageId);

    if (batch.length === 0) {
      break;
    }

    // Extract only what we need, discard the rest immediately
    for (const msg of batch) {
      const ref: MessageRef = {
        id: msg.id,
        timestamp: new Date(msg.timestamp).getTime(),
      };

      if (isOlderThanTwoWeeks(ref.timestamp)) {
        old.push(ref);
      } else {
        recent.push(ref);
      }
    }

    lastMessageId = batch[batch.length - 1]?.id;

    if (batch.length < 100) {
      hasMore = false;
    }
  }

  return { channelId, channelName, recent, old };
}

// Phase 2: Bulk delete recent messages (fast)
export async function bulkDeleteRecent(
  channelId: string,
  recent: MessageRef[],
  onProgress?: (deleted: number) => void
): Promise<number> {
  if (recent.length === 0) return 0;

  let deleted = 0;
  const batches = chunk(recent, 100);

  for (const batch of batches) {
    if (batch.length >= 2) {
      await bulkDeleteMessages(channelId, batch.map((m) => m.id));
      deleted += batch.length;
      onProgress?.(deleted);
    } else if (batch.length === 1) {
      const success = await deleteMessage(channelId, batch[0]!.id);
      if (success) {
        deleted += 1;
        onProgress?.(deleted);
      }
    }
  }

  return deleted;
}

// Phase 3: Individual delete old messages (slow)
export async function deleteOldMessages(
  channelId: string,
  old: MessageRef[],
  onProgress?: (deleted: number, remaining: number) => void
): Promise<number> {
  if (old.length === 0) return 0;

  let deleted = 0;

  for (let i = 0; i < old.length; i++) {
    const msg = old[i]!;
    const success = await deleteMessage(channelId, msg.id);
    if (success) {
      deleted += 1;
      const remaining = old.length - (i + 1);
      onProgress?.(deleted, remaining);
    }
  }

  return deleted;
}
