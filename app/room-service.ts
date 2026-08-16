import "server-only";

import type { Player } from "./game-rules";
import {
  applyRoomAction,
  createOnlineGame,
  normalizeBoardSize,
  normalizeObjectionLimit,
  normalizeProfile,
  OnlineGameError,
} from "./online-engine";
import type {
  CreateRoomInput,
  CreateRoomResponse,
  RoomAction,
  RoomView,
  StoredRoom,
} from "./online-types";
import {
  generateAccessToken,
  generateActionCode,
  generateRoomId,
  hashAccessToken,
  publicRoom,
  randomSeed,
  sideForToken,
} from "./room-security";
import { getRoomStore, ROOM_TTL_SECONDS } from "./room-store";

export class RoomConflictError extends Error {
  readonly view: RoomView | null;

  constructor(view: RoomView | null) {
    super("相手の操作が先に反映されたので、最新の盤面へ更新しました。");
    this.name = "RoomConflictError";
    this.view = view;
  }
}

function expiresAt(now: Date) {
  return new Date(now.getTime() + ROOM_TTL_SECONDS * 1000).toISOString();
}

function authorizedView(room: StoredRoom, token: string): RoomView {
  const you = sideForToken(room, token);
  if (!you) throw new OnlineGameError("unauthorized", "この部屋を開く権限を確認できません。招待リンクを開き直してね。", 401);
  return { room: publicRoom(room), you };
}

export async function createRoom(input: unknown, now = new Date()): Promise<CreateRoomResponse> {
  if (!input || typeof input !== "object") throw new OnlineGameError("invalid_input", "部屋の設定を確認してね。");
  const source = input as Partial<CreateRoomInput>;
  const profile = normalizeProfile(source.profile);
  const boardSize = normalizeBoardSize(source.boardSize);
  const objectionLimit = normalizeObjectionLimit(source.objectionLimit, boardSize);
  const startingPlayer: Player = source.startingPlayer === "O" || source.startingPlayer === "X"
    ? source.startingPlayer
    : randomSeed() % 2 === 0 ? "O" : "X";
  const hostToken = generateAccessToken();
  const inviteToken = generateAccessToken();
  const timestamp = now.toISOString();
  const store = getRoomStore();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = generateRoomId();
    const seed = randomSeed();
    const room: StoredRoom = {
      id,
      revision: 0,
      status: "waiting",
      settings: { boardSize, startingPlayer, objectionLimit },
      players: {
        O: { side: "O", profile, joinedAt: timestamp },
        X: null,
      },
      auth: { O: hashAccessToken(hostToken), X: hashAccessToken(inviteToken) },
      game: createOnlineGame(seed, boardSize, startingPlayer, objectionLimit, generateActionCode()),
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: expiresAt(now),
    };
    if (await store.create(room)) {
      return { room: publicRoom(room), you: "O", accessToken: hostToken, inviteToken };
    }
  }
  throw new OnlineGameError("room_id_collision", "部屋を作れませんでした。少し待って、もう一度試してね。", 503);
}

export async function getRoomView(roomId: string, token: string): Promise<RoomView> {
  const room = await getRoomStore().get(roomId);
  if (!room) throw new OnlineGameError("room_not_found", "この部屋は見つからないか、24時間の期限が切れています。", 404);
  return authorizedView(room, token);
}

export async function mutateRoom(
  roomId: string,
  token: string,
  expectedRevision: number,
  action: RoomAction,
  now = new Date(),
): Promise<RoomView> {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new OnlineGameError("invalid_revision", "盤面の更新番号が不正です。再読み込みしてね。");
  }
  const store = getRoomStore();
  const current = await store.get(roomId);
  if (!current) throw new OnlineGameError("room_not_found", "この部屋は見つからないか、24時間の期限が切れています。", 404);
  const initialView = authorizedView(current, token);
  if (current.revision !== expectedRevision) throw new RoomConflictError(initialView);

  const timestamp = now.toISOString();
  const changed = applyRoomAction(current, initialView.you, action, timestamp, generateActionCode());
  const next: StoredRoom = {
    ...changed,
    revision: current.revision + 1,
    updatedAt: timestamp,
    expiresAt: expiresAt(now),
  };
  const result = await store.compareAndSet(roomId, expectedRevision, next);
  if (!result.ok) {
    if (!result.current) throw new OnlineGameError("room_not_found", "この部屋は期限切れになりました。", 404);
    throw new RoomConflictError(authorizedView(result.current, token));
  }
  return { room: publicRoom(next), you: initialView.you };
}
