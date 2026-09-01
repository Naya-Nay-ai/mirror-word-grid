import "server-only";

import { randomUUID } from "node:crypto";

import { OnlineGameError } from "./online-engine";
import { getRoomView } from "./room-service";
import {
  publicTeamChatMessage,
  TEAM_CHAT_COOLDOWN_MS,
  TEAM_CHAT_MAX_IMAGE_BYTES,
  TEAM_CHAT_TEXT_LIMIT,
  type TeamChatImage,
  type TeamChatMessage,
  type TeamChatView,
} from "./team-chat";
import { getTeamChatStore } from "./team-chat-store";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const BLOB_API_URL = "https://vercel.com/api/blob";
const BLOB_API_VERSION = "12";

type BlobCredentials = { token: string; storeId: string };
type BlobPutResult = { pathname: string; contentType: string };

function normalizeStoreId(value: string) {
  return value.startsWith("store_") ? value.slice("store_".length) : value;
}

function blobCredentials(): BlobCredentials {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new OnlineGameError("chat_image_storage_unavailable", "画像ストレージがまだ接続されていません。", 503);
  }
  const fromEnv = process.env.BLOB_STORE_ID?.trim();
  const fromToken = token.split("_")[3] ?? "";
  const storeId = normalizeStoreId(fromEnv || fromToken);
  if (!storeId) {
    throw new OnlineGameError("chat_image_storage_unavailable", "画像ストレージの接続情報を確認できません。", 503);
  }
  return { token, storeId };
}

function controlPlaneHeaders(credentials: BlobCredentials, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("Authorization", `Bearer ${credentials.token}`);
  headers.set("x-vercel-blob-store-id", credentials.storeId);
  headers.set("x-api-blob-request-id", `${credentials.storeId}:${Date.now()}:${Math.random().toString(16).slice(2)}`);
  headers.set("x-api-blob-request-attempt", "0");
  headers.set("x-api-version", BLOB_API_VERSION);
  return headers;
}

function privateBlobUrl(pathname: string, storeId: string) {
  const safePath = pathname.split("/").map(encodeURIComponent).join("/");
  return `https://${storeId}.private.blob.vercel-storage.com/${safePath}`;
}

async function uploadPrivateImage(roomId: string, messageId: string, file: File): Promise<TeamChatImage> {
  const credentials = blobCredentials();
  const extension = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
  const pathname = `mwg-chat/${roomId}/${messageId}.${extension}`;
  const url = new URL(`${BLOB_API_URL}/`);
  url.searchParams.set("pathname", pathname);

  const headers = controlPlaneHeaders(credentials, {
    "Content-Type": file.type,
    "x-content-type": file.type,
    "x-vercel-blob-access": "private",
    "x-add-random-suffix": "0",
    "x-allow-overwrite": "0",
    "x-cache-control-max-age": "3600",
  });

  const response = await fetch(url, { method: "PUT", headers, body: file });
  if (!response.ok) {
    console.error("Team chat blob upload failed", response.status, await response.text());
    throw new OnlineGameError("chat_image_upload_failed", "画像を送れませんでした。少し待って、もう一度試してね。", 502);
  }
  const result = await response.json() as Partial<BlobPutResult>;
  if (!result.pathname) {
    throw new OnlineGameError("chat_image_upload_failed", "画像を送れませんでした。少し待って、もう一度試してね。", 502);
  }
  return { pathname: result.pathname, contentType: result.contentType ?? file.type };
}

async function deletePrivateImages(pathnames: string[]) {
  if (pathnames.length === 0) return;
  try {
    const credentials = blobCredentials();
    const urls = pathnames.map((pathname) => privateBlobUrl(pathname, credentials.storeId));
    const headers = controlPlaneHeaders(credentials, { "Content-Type": "application/json" });
    const response = await fetch(`${BLOB_API_URL}/delete`, {
      method: "POST",
      headers,
      body: JSON.stringify({ urls }),
    });
    if (!response.ok) console.error("Team chat blob cleanup failed", response.status, await response.text());
  } catch (error) {
    console.error("Team chat blob cleanup failed", error);
  }
}

function normalizedText(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (Array.from(text).length > TEAM_CHAT_TEXT_LIMIT) {
    throw new OnlineGameError("chat_text_too_long", `メッセージは${TEAM_CHAT_TEXT_LIMIT}文字までだよ。`, 400);
  }
  return text;
}

function normalizeImage(value: unknown): File | null {
  if (!(value instanceof File) || value.size === 0) return null;
  if (!ALLOWED_IMAGE_TYPES.has(value.type)) {
    throw new OnlineGameError("chat_image_type", "画像はPNG・JPEG・WebPで送ってね。", 400);
  }
  if (value.size > TEAM_CHAT_MAX_IMAGE_BYTES) {
    throw new OnlineGameError("chat_image_too_large", "画像は2MBまでだよ。貼り付け画像は自動圧縮して送れるよ。", 413);
  }
  return value;
}

async function authorizedTeamChat(roomId: string, token: string) {
  const view = await getRoomView(roomId, token);
  if (view.room.settings.teamMode !== true) {
    throw new OnlineGameError("team_chat_unavailable", "ミニチャットは人間＋AIチーム戦で使えるよ。", 409);
  }
  if (!view.room.players.O || !view.room.players.X || view.room.status === "waiting") {
    throw new OnlineGameError("team_chat_unavailable", "相手が参加したらミニチャットが開くよ。", 409);
  }
  if (view.room.status === "closed") {
    throw new OnlineGameError("team_chat_unavailable", "この部屋のミニチャットは終了しました。", 409);
  }
  return view;
}

function chatView(
  view: Awaited<ReturnType<typeof authorizedTeamChat>>,
  messages: TeamChatMessage[],
): TeamChatView {
  return {
    messages: messages.map(publicTeamChatMessage),
    you: view.you,
    playerNames: {
      O: view.room.players.O?.profile.playerName || "O",
      X: view.room.players.X?.profile.playerName || "X",
    },
  };
}

export async function getTeamChatView(roomId: string, token: string): Promise<TeamChatView> {
  const view = await authorizedTeamChat(roomId, token);
  const channel = await getTeamChatStore().get(roomId);
  return chatView(view, channel.messages);
}

export async function sendTeamChatMessage(
  roomId: string,
  token: string,
  input: { text?: unknown; image?: unknown },
  now = new Date(),
): Promise<TeamChatView> {
  const view = await authorizedTeamChat(roomId, token);
  const text = normalizedText(input.text);
  const file = normalizeImage(input.image);
  if (!text && !file) {
    throw new OnlineGameError("chat_empty", "ひとことか画像、どっちか送ってね。", 400);
  }

  const id = randomUUID();
  let image: TeamChatImage | undefined;
  if (file) image = await uploadPrivateImage(roomId, id, file);

  const store = getTeamChatStore();
  const result = await store.append(roomId, {
    id,
    side: view.you,
    text,
    sentAt: now.getTime(),
    image,
  }, TEAM_CHAT_COOLDOWN_MS);

  if (!result.accepted) {
    if (image) await deletePrivateImages([image.pathname]);
    throw new OnlineGameError("team_chat_cooldown", "ちょっとだけ間をあけて送ってね。", 429);
  }

  void deletePrivateImages(result.removedImagePathnames);
  return chatView(view, result.channel.messages);
}

export async function getTeamChatImageResponse(
  roomId: string,
  token: string,
  messageId: string,
  ifNoneMatch?: string | null,
): Promise<Response> {
  await authorizedTeamChat(roomId, token);
  const channel = await getTeamChatStore().get(roomId);
  const message = channel.messages.find((item) => item.id === messageId);
  if (!message?.image) throw new OnlineGameError("chat_image_not_found", "画像が見つかりません。", 404);

  const credentials = blobCredentials();
  const headers = new Headers({ Authorization: `Bearer ${credentials.token}` });
  if (ifNoneMatch) headers.set("If-None-Match", ifNoneMatch);
  const response = await fetch(privateBlobUrl(message.image.pathname, credentials.storeId), { headers });
  if (response.status === 304) {
    return new Response(null, {
      status: 304,
      headers: { "Cache-Control": "private, no-cache", ETag: response.headers.get("etag") ?? "" },
    });
  }
  if (!response.ok || !response.body) {
    throw new OnlineGameError("chat_image_not_found", "画像が見つかりません。", 404);
  }

  return new Response(response.body, {
    headers: {
      "Cache-Control": "private, no-cache",
      "Content-Type": response.headers.get("content-type") || message.image.contentType,
      "X-Content-Type-Options": "nosniff",
      ...(response.headers.get("etag") ? { ETag: response.headers.get("etag")! } : {}),
    },
  });
}
