"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { BoardSize, Player } from "../game-rules";
import type { ControllerKind, CreateRoomResponse } from "../online-types";
import { latestRoomCredential, saveRoomCredential, type SavedRoomCredential } from "../room-client-storage";
import styles from "./online.module.css";

type ApiFailure = { error?: { message?: string } };
type SetupStep = 1 | 2 | 3;

export default function OnlineLobby() {
  const [playerName, setPlayerName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [controller, setController] = useState<ControllerKind>("ai");
  const [boardSize, setBoardSize] = useState<BoardSize>(4);
  const [startingPlayer, setStartingPlayer] = useState<Player | "random">("random");
  const [setupStep, setSetupStep] = useState<SetupStep>(1);
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [latest, setLatest] = useState<SavedRoomCredential | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setLatest(latestRoomCredential()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function moveToStep(nextStep: SetupStep) {
    if (nextStep > 1 && !playerName.trim()) {
      setError("プレイヤー名を入力してね。");
      setSetupStep(1);
      return;
    }
    if (nextStep > 2 && controller === "ai" && !partnerName.trim()) {
      setError("ホームAIで遊ぶときは、AI・相棒名も入力してね。");
      setSetupStep(2);
      return;
    }
    setError("");
    setSetupStep(nextStep);
  }

  async function createOnlineRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!playerName.trim()) {
      setError("プレイヤー名を入力してね。");
      setSetupStep(1);
      return;
    }
    if (controller === "ai" && !partnerName.trim()) {
      setError("ホームAIで遊ぶときは、AI・相棒名も入力してね。");
      setSetupStep(2);
      return;
    }

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
      if (!response.ok) throw new Error(body.error?.message ?? "対戦ルームを作れませんでした。");
      saveRoomCredential({
        roomId: body.room.id,
        accessToken: body.accessToken,
        inviteToken: body.inviteToken,
        side: body.you,
        savedAt: new Date().toISOString(),
      });
      window.location.assign(`/room/${body.room.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "対戦ルームを作れませんでした。");
      setBusy(false);
    }
  }

  return (
    <main className={styles.lobbyShell}>
      <section className={styles.heroCard}>
        <div className={styles.heroCopy}>
          <div className={styles.brandLockup}>
            <Link href="/" className={styles.logoLink} aria-label="MIRROR WORD GRID トップへ">
              <Image src="/mirror-word-grid-logo.png" alt="MIRROR WORD GRID" width={835} height={483} priority unoptimized />
            </Link>
            <div className={styles.onlineBadge}><i /> ONLINE MATCH</div>
          </div>
          <h1>離れていても、<span>同じ盤面で遊べる。</span></h1>
          <p>招待URLをDiscordやXのDMで送るだけ。プレイヤー同士でも、お互いのホームAIを連れてきても対戦できます。</p>
        </div>

        <div className={styles.courierCard} aria-label="AIホームと共有ゲーム盤の間で、プレイヤーが手番を運びます">
          <span><b aria-hidden="true">🏠</b><strong>AIホーム</strong></span>
          <b className={styles.exchangeMark}>⇄<small>手番</small></b>
          <span><strong>共有ゲーム盤</strong><b aria-hidden="true">🎮</b></span>
          <p>AI APIは使いません。会話は各社AIのホームに残ります。</p>
        </div>
      </section>

      <div className={styles.lobbyGrid}>
        <form className={styles.setupCard} onSubmit={createOnlineRoom} noValidate>
          <ol className={styles.stepProgress} aria-label="対戦設定の進み具合">
            {[1, 2, 3].map((step) => (
              <li key={step} className={setupStep === step ? styles.currentStep : setupStep > step ? styles.doneStep : ""}>
                <span>{setupStep > step ? "✓" : step}</span>
                <small>STEP {step}</small>
              </li>
            ))}
          </ol>

          <section className={styles.setupSection} data-active={setupStep === 1}>
            <div className={styles.sectionHeading}><span>01</span><div><small>YOUR TEAM</small><h2>あなた側の名前</h2></div></div>
            <label className={styles.field}>
              <span>プレイヤー名 <b>必須</b></span>
              <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={12} placeholder="例：なや" autoComplete="nickname" required />
            </label>
            <button className={styles.nextButton} type="button" onClick={() => moveToStep(2)}>次へ <b>→</b></button>
          </section>

          <section className={styles.setupSection} data-active={setupStep === 2}>
            <div className={styles.sectionHeading}><span>02</span><div><small>WHO DECIDES?</small><h2>手を決める担当</h2></div></div>
            <div className={styles.choiceGrid}>
              <button type="button" className={controller === "ai" ? styles.selectedChoice : ""} onClick={() => setController("ai")}>
                <b>✦ ホームAI</b><small>手番をコピーして相談</small>
              </button>
              <button type="button" className={controller === "human" ? styles.selectedChoice : ""} onClick={() => setController("human")}>
                <b>● プレイヤー</b><small>盤面で直接選ぶ</small>
              </button>
            </div>
            <label className={styles.field}>
              <span>AI・相棒名 <b>{controller === "ai" ? "必須" : "任意"}</b></span>
              <input value={partnerName} onChange={(event) => setPartnerName(event.target.value)} maxLength={12} placeholder="例：Nay" aria-required={controller === "ai"} />
            </label>
            <p className={styles.namePreview}>盤面表示：<strong>{playerName || "あなた"}{partnerName ? `＆${partnerName}` : ""}</strong></p>
            <div className={styles.stepActions}>
              <button className={styles.previousButton} type="button" onClick={() => moveToStep(1)}>← 前へ</button>
              <button className={styles.nextButton} type="button" onClick={() => moveToStep(3)}>次へ <b>→</b></button>
            </div>
          </section>

          <section className={styles.setupSection} data-active={setupStep === 3}>
            <div className={styles.sectionHeading}><span>03</span><div><small>MATCH SETTINGS</small><h2>盤面サイズ・先攻</h2></div></div>
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
            <div className={styles.createActions}>
              <button className={styles.previousButton} type="button" onClick={() => moveToStep(2)}>← 前へ</button>
              <button className={styles.createButton} disabled={busy} type="submit">
                <span>{busy ? "ルームを準備中…" : "対戦ルームを作る"}</span><b>→</b>
              </button>
            </div>
            <p className={styles.ttlNote}>最後の有効操作から24時間で自動消去。アカウント登録は不要です。</p>
          </section>

          {error && <p className={styles.error} role="alert">{error}</p>}
        </form>

        <aside className={styles.guideColumn}>
          <section className={styles.flowCard}>
            <div className={styles.guideIntro}><small>HOW IT WORKS</small><h2>3ステップで対戦</h2></div>
            <button className={styles.guideToggle} type="button" aria-expanded={guideOpen} onClick={() => setGuideOpen((open) => !open)}>
              <span><small>HOW IT WORKS</small><strong>遊び方を見る</strong></span><b>{guideOpen ? "−" : "+"}</b>
            </button>
            <div className={styles.guideContent} data-open={guideOpen}>
              <ol>
                <li><b>1</b><div><strong>対戦ルームを作る</strong><span>名前と操作担当を決める</span></div></li>
                <li><b>2</b><div><strong>URLをDMで送る</strong><span>相手はリンクから参加</span></div></li>
                <li><b>3</b><div><strong>同じ盤面で遊ぶ</strong><span>盤面は自動同期。AIの返答だけ各ユーザーが運ぶ</span></div></li>
              </ol>
              <div className={styles.combinationsLine} aria-label="対応する対戦の組み合わせ">
                <span>人間 VS 人間</span><span>人間 VS AI</span><span>AI VS AI</span>
              </div>
            </div>
          </section>

          {latest && (
            <section className={styles.resumeCard}>
              <div><small>SAVED ON THIS DEVICE</small><h2>前の部屋へ戻る</h2></div>
              <Link href={`/room/${latest.roomId}`}>部屋を開く <b>→</b></Link>
            </section>
          )}
          <Link href="/" className={styles.backLink}>← ひとつの端末で遊ぶ</Link>
        </aside>
      </div>
    </main>
  );
}
