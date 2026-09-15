"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { credentialForRoom } from "../../room-client-storage";
import RoomClient from "./room-client";
import TeamMiniChat from "./team-mini-chat";
import styles from "./room.module.css";

export default function RoomSessionGate({ roomId }: { roomId: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const saved = credentialForRoom(roomId);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const guestToken = hash.get("guest") ?? "";
      const accessToken = guestToken && saved?.side !== "O"
        ? guestToken
        : saved?.accessToken ?? guestToken;

      if (accessToken) {
        try {
          await fetch(`/api/rooms/${roomId}/session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken }),
          });
        } catch {
          // 従来のAuthorizationヘッダー経路も残しているため、失敗時も本体へ進む。
        }
      }

      if (!cancelled) setReady(true);
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  if (!ready) {
    return (
      <main className={styles.loadingShell}>
        <Image src="/mirror-word-grid-logo.png" alt="MIRROR WORD GRID" width={835} height={483} priority unoptimized />
        <div className={styles.loadingDots}><i /><i /><i /></div>
        <p>対戦部屋へ接続中…</p>
      </main>
    );
  }

  return (
    <>
      <RoomClient roomId={roomId} />
      <TeamMiniChat roomId={roomId} />
    </>
  );
}
