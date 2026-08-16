import type { CreateRoomResponse } from "../../online-types";
import { createRoom } from "../../room-service";
import { errorResponse, json, readJson } from "../room-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = await readJson(request);
    const response: CreateRoomResponse = await createRoom(input);
    return json(response, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
