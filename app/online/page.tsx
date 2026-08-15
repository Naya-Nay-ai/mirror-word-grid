"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { BoardSize, Player } from "../game-rules";
import type { ControllerKind, CreateRoomResponse } from "../online-types";
import { latestRoomCredential, saveRoomCredential, type SavedRoomCredential } from "../room-client-storage";
import styles from "./online.module.css";

type ApiFailure = { error?: { message?: string } };

export default function OnlineLobby() {
  const [playerName, setPlayerName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [controller, setController] = useState<ControllerKind>("ai");
  const [boardSize, setBoardSize] = useState<BoardSize>(4);
  const [startingPlayer, setStartingPlayer] = useState<Player | "random">("random");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [latest, setLatest] = useState<SavedRoomCredential | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setLatest(latestRoomCredential()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function createOnlineRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: { playerName, partnerName, controller },
          boardSize,
          startingPlayer,
        }),
      });
      const body = await response.json() as CreateRoomResponse & ApiFailure;
      if (!response.ok) throw new Error(body.error?.message ?? "部屋を作れませんでした。");
      saveRoomCredential({
        roomId: body.room.id,
        accessToken: body.accessToken,
        inviteToken: body.inviteToken,
        side: body.you,
        savedAt: new Date().toISOString(),
      });
      window.location.assign(`/room/${body.room.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "部屋を作れませんでした。");
      setBusy(false);
    }
  }

  return (
    <main className={styles.lobbyShell}>
      <header className={styles.lobbyHeader}>
        <Link href="/" className={styles.logoLink} aria-label="MIRROR WORD GRID トップへ">
          <Image src="/mirror-word-grid-logo.png" alt="MIRROR WORD GRID" width={835} height={483} priority unoptimized />
        </Link>
        <div className={styles.liveBadge}><i /> LIVE ROOM</div>
      </header>

      <section className={styles.lobbyHero}>
        <div>
          <p className={styles.kicker}>DISPOSABLE ONLINE MATCH</p>
          <h1>離れていても、<br /><span>同じ盤面で遊べる。</span></h1>
          <p>部屋を作って、招待URLをDiscordやXのDMで一度送るだけ。プレイヤー同士でも、お互いのホームAIを連れてきても対戦できるよ。</p>
        </div>
        <div className={styles.courierCard}>
          <span>🏠 AIホーム</span><b>← あなたが手番を運ぶ →</b><span>共有ゲーム盤</span>
          <small>AI APIは使いません。会話は各社AIのホームに残ります。</small>
        </div>
      </section>

      <div className={styles.lobbyGrid}>
        <form className={styles.setupCard} onSubmit={createOnlineRoom}>
          <div className={styles.sectionHeading}><span>01</span><div><small>YOUR TEAM</small><h2>あなた側の名前</h2></div></div>
          <label className={styles.field}>
            <span>プレイヤー名 <b>必須</b></span>
            <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={12} placeholder="例：なや" autoComplete="nickname" required />
          </label>
          <label className={styles.field}>
            <span>AI・相棒名 <b>{controller === "ai" ? "必須" : "任意"}</b></span>
            <input value={partnerName} onChange={(event) => setPartnerName(event.target.value)} maxLength={12} placeholder="例：Nay" required={controller === "ai"} />
          </label>
          <p className={styles.namePreview}>盤面表示：<strong>{playerName || "あなた"}{partnerName ? `＆${partnerName}` : ""}</strong></p>

          <div className={styles.sectionHeading}><span>02</span><div><small>WHO DECIDES?</small><h2>手を決める担当</h2></div></div>
          <div className={styles.choiceGrid}>
            <button type="button" className={controller === "ai" ? styles.selectedChoice : ""} onClick={() => setController("ai")}>
              <b>✦ ホームAI</b><small>手番をコピーして相談</small>
            </button>
            <button type="button" className={controller === "human" ? styles.selectedChoice : ""} onClick={() => setController("human")}>
              <b>● プレイヤー</b><small>盤面で直接選ぶ</small>
            </button>
          </div>

          <div className={styles.sectionHeading}><span>03</span><div><small>MATCH SETTINGS</small><h2>対戦設定</h2></div></div>
          <div className={styles.settingRow}>
            <span>盤面</span>
            <div className={styles.segmented}>
              <button type="button" className={boardSize === 4 ? styles.activeSegment : ""} onClick={() => setBoardSize(4)}>4×4</button>
              <button type="button" className={boardSize === 5 ? styles.activeSegment : ""} onClick={() => setBoardSize(5)}>5×5</button>
            </div>
          </div>
          <div className={styles.settingRow}>
            <span>先攻</span>
            <div className={styles.segmented}>
              <button type="button" className={startingPlayer === "random" ? styles.activeSegment : ""} onClick={() => setStartingPlayer("random")}>ランダム</button>
              <button type="button" className={startingPlayer === "O" ? styles.activeSegment : ""} onClick={() => setStartingPlayer("O")}>あなた</button>
              <button type="button" className={startingPlayer === "X" ? styles.activeSegment : ""} onClick={() => setStartingPlayer("X")}>相手</button>
            </div>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.createButton} disabled={busy} type="submit">
            <span>{busy ? "部屋を準備中…" : "使い捨て部屋を作る"}</span><b>→</b>
          </button>
          <p className={styles.ttlNote}>最後の有効操作から24時間で自動消去。アカウント登録は不要です。</p>
        </form>

        <aside className={styles.guideColumn}>
          <section className={styles.flowCard}>
            <small>HOW IT WORKS</small><h2>3ステップで対戦</h2>
            <ol>
              <li><b>1</b><div><strong>部屋を作る</strong><span>あなた側の名前と操作担当を決める</span></div></li>
              <li><b>2</b><div><strong>URLをDMで送る</strong><span>相手はリンクから名前を入れて参加</span></div></li>
              <li><b>3</b><div><strong>同じ盤面で遊ぶ</strong><span>更新は自動同期。AIの返答だけ各ユーザーが運ぶ</span></div></li>
            </ol>
          </section>
          <section className={styles.combinationsCard}>
            <small>ALL COMBINATIONS</small><h2>どの組み合わせもOK</h2>
            <div><span>人間</span><b>VS</b><span>人間</span></div>
            <div><span>人間</span><b>VS</b><span>AI</span></div>
            <div><span>AI</span><b>VS</b><span>AI</span></div>
          </section>
          {latest && (
            <section className={styles.resumeCard}>
              <small>SAVED ON THIS DEVICE</small><h2>前の部屋へ戻る</h2>
              <p>この端末に参加情報が残っているよ。</p>
              <Link href={`/room/${latest.roomId}`}>部屋を開く <b>→</b></Link>
            </section>
          )}
          <Link href="/" className={styles.backLink}>← ひとつの端末で遊ぶ</Link>
        </aside>
      </div>
    </main>
  );
}
