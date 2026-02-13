// Discord API types for discleanse

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export interface Channel {
  id: string;
  name: string;
  type: number;
  guild_id?: string;
  position?: number;
}

// Channel type constants
export const ChannelType = {
  GUILD_TEXT: 0,
  GUILD_VOICE: 2,
  GUILD_CATEGORY: 4,
  GUILD_ANNOUNCEMENT: 5,
  ANNOUNCEMENT_THREAD: 10,
  PUBLIC_THREAD: 11,
  PRIVATE_THREAD: 12,
  GUILD_FORUM: 15,
} as const;

export interface Thread {
  id: string;
  name: string;
  type: number;
  parent_id: string;
}

export interface ThreadList {
  threads: Thread[];
  has_more: boolean;
}

export interface Message {
  id: string;
  channel_id: string;
  author: {
    id: string;
    username: string;
  };
  content: string;
  timestamp: string;
}

export interface RateLimitInfo {
  remaining: number;
  resetAfter: number;
  bucket: string;
}

export interface DeleteStats {
  bulkDeleted: number;
  individualDeleted: number;
  timeMs: number;
}

export interface ChannelStats extends DeleteStats {
  channelId: string;
  channelName: string;
}
