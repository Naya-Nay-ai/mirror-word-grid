import type { Player } from "./game-rules";

const STORAGE_KEY = "mirror-word-grid-online-rooms-v1";

export type SavedRoomCredential = {
  roomId: string;
  accessToken: string;
  side: Player;
  inviteToken?: string;
  savedAt: string;
};

function readAll() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedRoomCredential => Boolean(
      item && typeof item === "object" &&
      typeof (item as SavedRoomCredential).roomId === "string" &&
      typeof (item as SavedRoomCredential).accessToken === "string" &&
      ((item as SavedRoomCredential).side === "O" || (item as SavedRoomCredential).side === "X") &&
      typeof (item as SavedRoomCredential).savedAt === "string",
    ));
  } catch {
    return [];
  }
}

function writeAll(items: SavedRoomCredential[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 8)));
}

export function saveRoomCredential(value: SavedRoomCredential) {
  const previous = readAll().find((item) => item.roomId === value.roomId);
  const merged = { ...previous, ...value, inviteToken: value.inviteToken ?? previous?.inviteToken };
  writeAll([merged, ...readAll().filter((item) => item.roomId !== value.roomId)]);
}

export function credentialForRoom(roomId: string) {
  return readAll().find((item) => item.roomId === roomId) ?? null;
}

export function latestRoomCredential() {
  return readAll().sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt))[0] ?? null;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  }
}
