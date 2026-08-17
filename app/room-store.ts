import "server-only";

import { Redis } from "@upstash/redis";

import type { StoredRoom } from "./online-types";
import {
  appendQuickReaction,
  emptyQuickReactionChannel,
  QUICK_REACTION_CHANNEL_TTL_SECONDS,
  type QuickReactionChannel,
  type QuickReactionEvent,
} from "./quick-reactions";
import { resolveRoomStoreCredentials } from "./room-store-credentials";

export const ROOM_TTL_SECONDS = 24 * 60 * 60;

export type CompareAndSetResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "conflict"; current: StoredRoom | null };

export interface RoomStore {
  create(room: StoredRoom): Promise<boolean>;
  get(roomId: string): Promise<StoredRoom | null>;
  compareAndSet(roomId: string, expectedRevision: number, next: StoredRoom): Promise<CompareAndSetResult>;
  getReactionChannel(roomId: string): Promise<QuickReactionChannel>;
  appendReaction(roomId: string, event: QuickReactionEvent, cooldownMs: number): Promise<{ accepted: boolean; channel: QuickReactionChannel }>;
}

export class RoomStoreConfigurationError extends Error {
  constructor() {
    super("オンライン部屋用ストレージがまだ接続されていません。");
    this.name = "RoomStoreConfigurationError";
  }
}

const keyFor = (roomId: string) => `mwg:room:${roomId}`;
const reactionKeyFor = (roomId: string) => `${keyFor(roomId)}:reactions`;

const CAS_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
  return -1
end
local decoded = cjson.decode(current)
if tonumber(decoded.revision) ~= tonumber(ARGV[1]) then
  return 0
end
redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
return 1
`;

const APPEND_REACTION_SCRIPT = `
local current = redis.call("GET", KEYS[1])
local channel = { events = {}, lastSentAt = {} }
if current then
  channel = cjson.decode(current)
end
local side = ARGV[1]
local sentAt = tonumber(ARGV[2])
local cooldown = tonumber(ARGV[3])
local previous = tonumber(channel.lastSentAt[side] or 0)
if sentAt - previous < cooldown then
  return { 0, cjson.encode(channel) }
end
table.insert(channel.events, cjson.decode(ARGV[4]))
while #channel.events > 2 do
  table.remove(channel.events, 1)
end
channel.lastSentAt[side] = sentAt
local encoded = cjson.encode(channel)
redis.call("SET", KEYS[1], encoded, "EX", ARGV[5])
return { 1, encoded }
`;

function roomFromValue(value: StoredRoom | string | null) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as StoredRoom;
    } catch {
      return null;
    }
  }
  return value;
}

function reactionChannelFromValue(value: QuickReactionChannel | string | null) {
  if (!value) return emptyQuickReactionChannel();
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as QuickReactionChannel;
    } catch {
      return emptyQuickReactionChannel();
    }
  }
  return value;
}

class UpstashRoomStore implements RoomStore {
  private readonly redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async create(room: StoredRoom) {
    const result = await this.redis.set(keyFor(room.id), room, { ex: ROOM_TTL_SECONDS, nx: true });
    return result === "OK";
  }

  async get(roomId: string) {
    const value = await this.redis.get<StoredRoom | string>(keyFor(roomId));
    return roomFromValue(value);
  }

  async compareAndSet(roomId: string, expectedRevision: number, next: StoredRoom): Promise<CompareAndSetResult> {
    const result = await this.redis.eval<[string, string, string], number>(
      CAS_SCRIPT,
      [keyFor(roomId)],
      [String(expectedRevision), JSON.stringify(next), String(ROOM_TTL_SECONDS)],
    );
    if (result === 1) return { ok: true };
    const current = await this.get(roomId);
    return { ok: false, reason: result === -1 ? "missing" : "conflict", current };
  }

  async getReactionChannel(roomId: string) {
    const value = await this.redis.get<QuickReactionChannel | string>(reactionKeyFor(roomId));
    return reactionChannelFromValue(value);
  }

  async appendReaction(roomId: string, event: QuickReactionEvent, cooldownMs: number) {
    const result = await this.redis.eval<[string, string, string, string, string], [number, string]>(
      APPEND_REACTION_SCRIPT,
      [reactionKeyFor(roomId)],
      [event.side, String(event.sentAt), String(cooldownMs), JSON.stringify(event), String(QUICK_REACTION_CHANNEL_TTL_SECONDS)],
    );
    return { accepted: result[0] === 1, channel: reactionChannelFromValue(result[1]) };
  }
}

type MemoryEntry = { room: StoredRoom; expiresAt: number };
type ReactionMemoryEntry = { channel: QuickReactionChannel; expiresAt: number };
type RoomGlobals = typeof globalThis & {
  __mwgRooms?: Map<string, MemoryEntry>;
  __mwgReactions?: Map<string, ReactionMemoryEntry>;
};

class MemoryRoomStore implements RoomStore {
  private readonly rooms = (globalThis as RoomGlobals).__mwgRooms ?? new Map<string, MemoryEntry>();
  private readonly reactions = (globalThis as RoomGlobals).__mwgReactions ?? new Map<string, ReactionMemoryEntry>();

  constructor() {
    (globalThis as RoomGlobals).__mwgRooms = this.rooms;
    (globalThis as RoomGlobals).__mwgReactions = this.reactions;
  }

  private read(roomId: string) {
    const entry = this.rooms.get(roomId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.rooms.delete(roomId);
      return null;
    }
    return entry;
  }

  async create(room: StoredRoom) {
    if (this.read(room.id)) return false;
    this.rooms.set(room.id, { room: structuredClone(room), expiresAt: Date.now() + ROOM_TTL_SECONDS * 1000 });
    return true;
  }

  async get(roomId: string) {
    const entry = this.read(roomId);
    return entry ? structuredClone(entry.room) : null;
  }

  async compareAndSet(roomId: string, expectedRevision: number, next: StoredRoom): Promise<CompareAndSetResult> {
    const entry = this.read(roomId);
    if (!entry) return { ok: false, reason: "missing", current: null };
    if (entry.room.revision !== expectedRevision) {
      return { ok: false, reason: "conflict", current: structuredClone(entry.room) };
    }
    this.rooms.set(roomId, { room: structuredClone(next), expiresAt: Date.now() + ROOM_TTL_SECONDS * 1000 });
    return { ok: true };
  }

  async getReactionChannel(roomId: string) {
    const entry = this.reactions.get(roomId);
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) this.reactions.delete(roomId);
      return emptyQuickReactionChannel();
    }
    return structuredClone(entry.channel);
  }

  async appendReaction(roomId: string, event: QuickReactionEvent, cooldownMs: number) {
    const result = appendQuickReaction(await this.getReactionChannel(roomId), event, cooldownMs);
    if (result.accepted) {
      this.reactions.set(roomId, {
        channel: structuredClone(result.channel),
        expiresAt: Date.now() + QUICK_REACTION_CHANNEL_TTL_SECONDS * 1000,
      });
    }
    return structuredClone(result);
  }
}

let store: RoomStore | null = null;

export function getRoomStore(): RoomStore {
  if (store) return store;
  const credentials = resolveRoomStoreCredentials();
  if (credentials) {
    store = new UpstashRoomStore(new Redis(credentials));
    return store;
  }
  if (process.env.NODE_ENV !== "production" || process.env.MWG_ALLOW_MEMORY_STORE === "1") {
    store = new MemoryRoomStore();
    return store;
  }
  throw new RoomStoreConfigurationError();
}
