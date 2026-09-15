import { NextResponse } from "next/server";

import { OnlineGameError } from "../../../../online-engine";
import { roomSessionCookieName } from "../../../../room-security";
import { getRoomView } from "../../../../room-service";
import { ROOM_TTL_SECONDS } from "../../../../room-store";
import { errorResponse, readJson } from "../../../room-response";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ roomId: string }> };

function validRoomId(value: string) {
  if (!/^[a-z0-9_-]{8,32}$/u.test(value)) throw new OnlineGameError("invalid_room_id", "部屋IDが不正です。", 404);
  return value;
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { roomId } = await params;
    const id = validRoomId(roomId);
    const body = await readJson(request);
    if (!body || typeof body !== "object") {
      throw new OnlineGameError("invalid_session", "参加情報を確認できませんでした。", 400);
    }
    const accessToken = (body as { accessToken?: unknown }).accessToken;
    if (typeof accessToken !== "string") {
      throw new OnlineGameError("invalid_session", "参加情報を確認できませんでした。", 400);
    }

    await getRoomView(id, accessToken);

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: roomSessionCookieName(id),
      value: accessToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/api/rooms/${id}`,
      maxAge: ROOM_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
