import { OnlineGameError } from "../../../online-engine";
import type { RoomAction } from "../../../online-types";
import { roomToken } from "../../../room-security";
import { getRoomView, mutateRoom } from "../../../room-service";
import { errorResponse, readJson, viewResponse } from "../../room-response";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ roomId: string }> };

function validRoomId(value: string) {
  if (!/^[a-z0-9_-]{8,32}$/u.test(value)) throw new OnlineGameError("invalid_room_id", "部屋IDが不正です。", 404);
  return value;
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { roomId } = await params;
    const id = validRoomId(roomId);
    const view = await getRoomView(id, roomToken(request, id));
    return viewResponse(view);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { roomId } = await params;
    const id = validRoomId(roomId);
    const body = await readJson(request);
    if (!body || typeof body !== "object") throw new OnlineGameError("invalid_action", "操作内容を読み取れませんでした。");
    const source = body as { expectedRevision?: unknown; action?: unknown };
    if (!source.action || typeof source.action !== "object" || typeof (source.action as { type?: unknown }).type !== "string") {
      throw new OnlineGameError("invalid_action", "操作内容を読み取れませんでした。");
    }
    const view = await mutateRoom(
      id,
      roomToken(request, id),
      Number(source.expectedRevision),
      source.action as RoomAction,
    );
    return viewResponse(view);
  } catch (error) {
    return errorResponse(error);
  }
}
