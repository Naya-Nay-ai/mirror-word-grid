import { OnlineGameError } from "../online-engine";
import type { RoomView } from "../online-types";
import { RoomConflictError } from "../room-service";
import { RoomStoreConfigurationError } from "../room-store";

const JSON_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
};

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: JSON_HEADERS });
}

export async function readJson(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 32_000) {
    throw new OnlineGameError("payload_too_large", "送信内容が大きすぎます。", 413);
  }
  const text = await request.text();
  if (text.length > 32_000) throw new OnlineGameError("payload_too_large", "送信内容が大きすぎます。", 413);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OnlineGameError("invalid_json", "送信内容を読み取れませんでした。", 400);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof RoomConflictError) {
    return json({ error: { code: "revision_conflict", message: error.message }, view: error.view }, 409);
  }
  if (error instanceof OnlineGameError) {
    return json({ error: { code: error.code, message: error.message } }, error.status);
  }
  if (error instanceof RoomStoreConfigurationError) {
    return json({ error: { code: "storage_unavailable", message: error.message } }, 503);
  }
  console.error("Online room request failed", error);
  return json({ error: { code: "internal_error", message: "部屋の処理に失敗しました。少し待って、もう一度試してね。" } }, 500);
}

export function viewResponse(view: RoomView) {
  return json({ view });
}
