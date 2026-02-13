// Message deletion logic - bulk and individual

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

export async function deleteChannelMessages(
  channelId: string,
  onProgress?: (bulk: number, individual: number) => void
): Promise<DeleteStats> {
  const startTime = Date.now();
  let bulkDeleted = 0;
  let individualDeleted = 0;

  let lastMessageId: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const messages = await getChannelMessages(channelId, lastMessageId);
    console.log(`  Fetched ${messages.length} messages`);

    if (messages.length === 0) {
      hasMore = false;
      break;
    }

    lastMessageId = messages[messages.length - 1]?.id;

    // Split messages by age
    const recent: string[] = [];
    const old: Message[] = [];

    for (const msg of messages) {
      if (isOlderThanTwoWeeks(msg)) {
        old.push(msg);
      } else {
        recent.push(msg.id);
      }
    }
    console.log(`  Recent: ${recent.length}, Old: ${old.length}`);

    // Bulk delete recent messages (2-100 at a time)
    if (recent.length >= 2) {
      await bulkDeleteMessages(channelId, recent);
      bulkDeleted += recent.length;
      onProgress?.(bulkDeleted, individualDeleted);
    } else if (recent.length === 1) {
      // Single recent message - delete individually
      const deleted = await deleteMessage(channelId, recent[0]!);
      if (deleted) {
        individualDeleted += 1;
        onProgress?.(bulkDeleted, individualDeleted);
      }
    }

    // Delete old messages one by one
    for (const msg of old) {
      const deleted = await deleteMessage(channelId, msg.id);
      if (deleted) {
        individualDeleted += 1;
        onProgress?.(bulkDeleted, individualDeleted);
      }
    }

    // If we got fewer than 100 messages, we've reached the end
    if (messages.length < 100) {
      hasMore = false;
    }
  }

  return {
    bulkDeleted,
    individualDeleted,
    timeMs: Date.now() - startTime,
  };
}
