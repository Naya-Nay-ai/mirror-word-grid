import "server-only";

import { Redis } from "@upstash/redis";

import type { StoredRoom } from "./online-types";

export const ROOM_TTL_SECONDS = 24 * 60 * 60;

export type CompareAndSetResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "conflict"; current: StoredRoom | null };

export interface RoomStore {
  create(room: StoredRoom): Promise<boolean>;
  get(roomId: string): Promise<StoredRoom | null>;
  compareAndSet(roomId: string, expectedRevision: number, next: StoredRoom): Promise<CompareAndSetResult>;
}

export class RoomStoreConfigurationError extends Error {
  constructor() {
    super("オンライン部屋用ストレージがまだ接続されていません。");
    this.name = "RoomStoreConfigurationError";
  }
}

const keyFor = (roomId: string) => `mwg:room:${roomId}`;

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
}

type MemoryEntry = { room: StoredRoom; expiresAt: number };
type RoomGlobals = typeof globalThis & { __mwgRooms?: Map<string, MemoryEntry> };

class MemoryRoomStore implements RoomStore {
  private readonly rooms = (globalThis as RoomGlobals).__mwgRooms ?? new Map<string, MemoryEntry>();

  constructor() {
    (globalThis as RoomGlobals).__mwgRooms = this.rooms;
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
}

let store: RoomStore | null = null;

export function getRoomStore(): RoomStore {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    store = new UpstashRoomStore(new Redis({ url, token }));
    return store;
  }
  if (process.env.NODE_ENV !== "production" || process.env.MWG_ALLOW_MEMORY_STORE === "1") {
    store = new MemoryRoomStore();
    return store;
  }
  throw new RoomStoreConfigurationError();
}
