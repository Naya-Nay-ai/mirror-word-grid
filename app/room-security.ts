import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { Player } from "./game-rules";
import type { PublicRoom, StoredRoom } from "./online-types";

export function generateAccessToken() {
  return randomBytes(32).toString("base64url");
}

export function generateRoomId() {
  return randomBytes(9).toString("base64url").toLowerCase();
}

export function generateActionCode() {
  return `MWG-${randomBytes(5).toString("hex").toUpperCase()}`;
}

export function randomSeed() {
  return randomBytes(4).readUInt32BE(0) & 0x7fffffff;
}

export function hashAccessToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function sideForToken(room: StoredRoom, token: string): Player | null {
  if (!token || token.length > 256) return null;
  const incoming = Buffer.from(hashAccessToken(token), "hex");
  for (const side of ["O", "X"] as const) {
    const expected = Buffer.from(room.auth[side], "hex");
    if (incoming.length === expected.length && timingSafeEqual(incoming, expected)) return side;
  }
  return null;
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer ([A-Za-z0-9_-]{20,256})$/u);
  return match?.[1] ?? "";
}

export function publicRoom(room: StoredRoom): PublicRoom {
  const { auth, ...safeRoom } = room;
  void auth;
  return safeRoom;
}
