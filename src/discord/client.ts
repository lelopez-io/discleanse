// Discord API client with built-in rate limiting

import type { Guild, Channel, Message, RateLimitInfo, ThreadList } from "./types";

const BASE_URL = "https://discord.com/api/v10";

function getToken(): string {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error("DISCORD_TOKEN environment variable is required");
  }
  return token;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
  return {
    remaining: Number(headers.get("X-RateLimit-Remaining") ?? 1),
    resetAfter: Number(headers.get("X-RateLimit-Reset-After") ?? 0) * 1000,
    bucket: headers.get("X-RateLimit-Bucket") ?? "unknown",
  };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = getToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const rateLimit = parseRateLimitHeaders(response.headers);

  // Handle rate limiting
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After") ?? 1) * 1000;
    console.log(`  Rate limited, waiting ${Math.ceil(retryAfter / 1000)}s...`);
    await sleep(retryAfter + 100);
    return request(method, path, body);
  }

  // Preemptive rate limit pause
  if (rateLimit.remaining === 0) {
    await sleep(rateLimit.resetAfter + 100);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Discord API error ${response.status}: ${error}`);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// Guild endpoints
export async function getGuild(guildId: string): Promise<Guild> {
  return request<Guild>("GET", `/guilds/${guildId}`);
}

export async function getGuildChannels(guildId: string): Promise<Channel[]> {
  return request<Channel[]>("GET", `/guilds/${guildId}/channels`);
}

// Channel endpoints
export async function getChannelMessages(
  channelId: string,
  before?: string
): Promise<Message[]> {
  const query = before ? `?limit=100&before=${before}` : "?limit=100";
  return request<Message[]>("GET", `/channels/${channelId}/messages${query}`);
}

export async function deleteMessage(
  channelId: string,
  messageId: string
): Promise<boolean> {
  // Conservative rate limiting for individual deletes (~3/sec)
  await sleep(350);
  try {
    await request<void>("DELETE", `/channels/${channelId}/messages/${messageId}`);
    return true;
  } catch (error) {
    // Skip system messages that can't be deleted (code 50021)
    if (error instanceof Error && error.message.includes("50021")) {
      console.log(`  (skipped system message ${messageId})`);
      return false;
    }
    throw error;
  }
}

export async function bulkDeleteMessages(
  channelId: string,
  messageIds: string[]
): Promise<void> {
  if (messageIds.length < 2 || messageIds.length > 100) {
    throw new Error("Bulk delete requires 2-100 message IDs");
  }
  return request<void>("POST", `/channels/${channelId}/messages/bulk-delete`, {
    messages: messageIds,
  });
}

export async function deleteChannel(channelId: string): Promise<void> {
  return request<void>("DELETE", `/channels/${channelId}`);
}

// Thread endpoints
export async function getActiveThreads(guildId: string): Promise<ThreadList> {
  return request<ThreadList>("GET", `/guilds/${guildId}/threads/active`);
}

export async function getArchivedPublicThreads(
  channelId: string
): Promise<ThreadList> {
  return request<ThreadList>(
    "GET",
    `/channels/${channelId}/threads/archived/public`
  );
}

export async function getArchivedPrivateThreads(
  channelId: string
): Promise<ThreadList> {
  return request<ThreadList>(
    "GET",
    `/channels/${channelId}/threads/archived/private`
  );
}

export async function unarchiveThread(threadId: string): Promise<void> {
  await request<unknown>("PATCH", `/channels/${threadId}`, { archived: false });
}
