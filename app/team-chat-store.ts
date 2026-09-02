import "server-only";

import { Redis } from "@upstash/redis";

import { resolveRoomStoreCredentials } from "./room-store-credentials";
import {
  appendTeamChat,
  emptyTeamChatChannel,
  TEAM_CHAT_MAX_MESSAGES,
  TEAM_CHAT_TTL_SECONDS,
  type TeamChatChannel,
  type TeamChatMessage,
} from "./team-chat";

export type AppendTeamChatResult = {
  accepted: boolean;
  channel: TeamChatChannel;
  removedImagePathnames: string[];
};

export interface TeamChatStore {
  get(roomId: string): Promise<TeamChatChannel>;
  append(roomId: string, message: TeamChatMessage, cooldownMs: number): Promise<AppendTeamChatResult>;
}

const keyFor = (roomId: string) => `mwg:room:${roomId}:team-chat`;

const APPEND_CHAT_SCRIPT = `
local current = redis.call("GET", KEYS[1])
local channel = { messages = {}, lastSentAt = {} }
if current then
  channel = cjson.decode(current)
end
local side = ARGV[1]
local sentAt = tonumber(ARGV[2])
local cooldown = tonumber(ARGV[3])
local previous = tonumber(channel.lastSentAt[side] or 0)
if sentAt - previous < cooldown then
  return { 0, cjson.encode(channel), "[]" }
end

table.insert(channel.messages, cjson.decode(ARGV[4]))
local removed = {}
local maxMessages = tonumber(ARGV[5])
while #channel.messages > maxMessages do
  local item = table.remove(channel.messages, 1)
  if item.image and item.image.pathname then
    table.insert(removed, item.image.pathname)
  end
end
channel.lastSentAt[side] = sentAt
local encoded = cjson.encode(channel)
redis.call("SET", KEYS[1], encoded, "EX", ARGV[6])
return { 1, encoded, cjson.encode(removed) }
`;

function channelFromValue(value: TeamChatChannel | string | null): TeamChatChannel {
  if (!value) return emptyTeamChatChannel();
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as TeamChatChannel;
    } catch {
      return emptyTeamChatChannel();
    }
  }
  return value;
}

class UpstashTeamChatStore implements TeamChatStore {
  constructor(private readonly redis: Redis) {}

  async get(roomId: string) {
    const value = await this.redis.get<TeamChatChannel | string>(keyFor(roomId));
    return channelFromValue(value);
  }

  async append(roomId: string, message: TeamChatMessage, cooldownMs: number) {
    const result = await this.redis.eval<
      [string, string, string, string, string, string],
      [number, string, string]
    >(
      APPEND_CHAT_SCRIPT,
      [keyFor(roomId)],
      [
        message.side,
        String(message.sentAt),
        String(cooldownMs),
        JSON.stringify(message),
        String(TEAM_CHAT_MAX_MESSAGES),
        String(TEAM_CHAT_TTL_SECONDS),
      ],
    );

    let removedImagePathnames: string[] = [];
    try {
      const parsed = JSON.parse(result[2]) as unknown;
      if (Array.isArray(parsed)) {
        removedImagePathnames = parsed.filter((value): value is string => typeof value === "string");
      }
    } catch {
      removedImagePathnames = [];
    }

    return {
      accepted: result[0] === 1,
      channel: channelFromValue(result[1]),
      removedImagePathnames,
    };
  }
}

type MemoryEntry = { channel: TeamChatChannel; expiresAt: number };
type TeamChatGlobals = typeof globalThis & { __mwgTeamChats?: Map<string, MemoryEntry> };

class MemoryTeamChatStore implements TeamChatStore {
  private readonly chats = (globalThis as TeamChatGlobals).__mwgTeamChats ?? new Map<string, MemoryEntry>();

  constructor() {
    (globalThis as TeamChatGlobals).__mwgTeamChats = this.chats;
  }

  private read(roomId: string) {
    const entry = this.chats.get(roomId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.chats.delete(roomId);
      return null;
    }
    return entry;
  }

  async get(roomId: string) {
    return structuredClone(this.read(roomId)?.channel ?? emptyTeamChatChannel());
  }

  async append(roomId: string, message: TeamChatMessage, cooldownMs: number) {
    const result = appendTeamChat(await this.get(roomId), message, cooldownMs);
    if (result.accepted) {
      this.chats.set(roomId, {
        channel: structuredClone(result.channel),
        expiresAt: Date.now() + TEAM_CHAT_TTL_SECONDS * 1000,
      });
    }
    return structuredClone(result);
  }
}

let store: TeamChatStore | null = null;

export function getTeamChatStore(): TeamChatStore {
  if (store) return store;
  const credentials = resolveRoomStoreCredentials();
  if (credentials) {
    store = new UpstashTeamChatStore(new Redis(credentials));
    return store;
  }
  store = new MemoryTeamChatStore();
  return store;
}
