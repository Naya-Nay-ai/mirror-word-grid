import { OnlineGameError } from "../../../../../../online-engine";
import { bearerToken } from "../../../../../../room-security";
import { getTeamChatImageResponse } from "../../../../../../team-chat-service";
import { errorResponse } from "../../../../../room-response";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ roomId: string; messageId: string }> };

function validRoomId(value: string) {
  if (!/^[a-z0-9_-]{8,32}$/u.test(value)) throw new OnlineGameError("invalid_room_id", "部屋IDが不正です。", 404);
  return value;
}

function validMessageId(value: string) {
  if (!/^[a-z0-9-]{8,64}$/iu.test(value)) throw new OnlineGameError("invalid_chat_message", "メッセージIDが不正です。", 404);
  return value;
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { roomId, messageId } = await params;
    return await getTeamChatImageResponse(
      validRoomId(roomId),
      bearerToken(request),
      validMessageId(messageId),
      request.headers.get("if-none-match"),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
