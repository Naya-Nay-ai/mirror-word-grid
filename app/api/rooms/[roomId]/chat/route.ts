import { OnlineGameError } from "../../../../online-engine";
import { bearerToken } from "../../../../room-security";
import { getTeamChatView, sendTeamChatMessage } from "../../../../team-chat-service";
import { TEAM_CHAT_MAX_IMAGE_BYTES } from "../../../../team-chat";
import { errorResponse, json } from "../../../room-response";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ roomId: string }> };

function validRoomId(value: string) {
  if (!/^[a-z0-9_-]{8,32}$/u.test(value)) throw new OnlineGameError("invalid_room_id", "部屋IDが不正です。", 404);
  return value;
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { roomId } = await params;
    const chatView = await getTeamChatView(validRoomId(roomId), bearerToken(request));
    return json({ chatView });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { roomId } = await params;
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > TEAM_CHAT_MAX_IMAGE_BYTES + 128_000) {
      throw new OnlineGameError("chat_payload_too_large", "送信画像が大きすぎます。", 413);
    }
    const form = await request.formData();
    const chatView = await sendTeamChatMessage(validRoomId(roomId), bearerToken(request), {
      text: form.get("text"),
      image: form.get("image"),
    });
    return json({ chatView });
  } catch (error) {
    return errorResponse(error);
  }
}
