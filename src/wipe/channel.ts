// Channel deletion logic

import { getChannelMessages, deleteChannel, unarchiveThread } from "../discord/client";
import { deleteChannelMessages } from "./message";
import type { ChannelStats } from "../discord/types";

export async function estimateMessageCount(channelId: string): Promise<number> {
  // Fetch first batch to get an estimate
  // This is imprecise but gives a rough idea for sorting
  const messages = await getChannelMessages(channelId);
  // If we got 100, there are likely more
  return messages.length === 100 ? 100 : messages.length;
}

export async function wipeChannel(
  channelId: string,
  channelName: string,
  onProgress?: (bulk: number, individual: number, eta: string) => void
): Promise<ChannelStats> {
  const stats = await deleteChannelMessages(channelId, onProgress);

  // Delete the channel itself
  await deleteChannel(channelId);

  return {
    channelId,
    channelName,
    ...stats,
  };
}

// Wipe thread messages only (thread is deleted with parent channel)
export async function wipeThreadMessages(
  threadId: string,
  threadName: string,
  onProgress?: (bulk: number, individual: number, eta: string) => void
): Promise<ChannelStats> {
  // Unarchive thread first (archived threads can't be modified)
  try {
    await unarchiveThread(threadId);
  } catch {
    // Thread may already be unarchived or we lack permission
  }

  const stats = await deleteChannelMessages(threadId, onProgress);

  return {
    channelId: threadId,
    channelName: threadName,
    ...stats,
  };
}
