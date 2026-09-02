import type { Metadata } from "next";

import RoomClient from "./room-client";
import TeamMiniChat from "./team-mini-chat";

type RoomPageProps = { params: Promise<{ roomId: string }> };

export const metadata: Metadata = {
  title: "オンライン対戦部屋 | MIRROR WORD GRID",
  description: "招待された二人だけで共有する、使い捨てのオンライン対戦部屋です。",
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;
  return (
    <>
      <RoomClient roomId={roomId} />
      <TeamMiniChat roomId={roomId} />
    </>
  );
}
