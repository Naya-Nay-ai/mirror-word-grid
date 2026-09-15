import { OnlineGameError } from "../../../../online-engine";
import { roomToken } from "../../../../room-security";
import { getRoomReactions, sendRoomReaction } from "../../../../room-service";
import { errorResponse, json, readJson } from "../../../room-response";

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
    const reactionView = await getRoomReactions(id, roomToken(request, id));
    return json({ reactionView });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { roomId } = await params;
    const id = validRoomId(roomId);
    const body = await readJson(request);
    if (!body || typeof body !== "object") throw new OnlineGameError("invalid_reaction", "リアクションを選び直してね。", 400);
    const reactionView = await sendRoomReaction(
      id,
      roomToken(request, id),
      (body as { reactionId?: unknown }).reactionId,
    );
    return json({ reactionView });
  } catch (error) {
    return errorResponse(error);
  }
}
