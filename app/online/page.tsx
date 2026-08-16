"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { BoardSize, Player } from "../game-rules";
import type { ControllerKind, CreateRoomResponse, RoomView } from "../online-types";
import {
  removeRoomCredential,
  savedRoomCredentials,
  saveRoomCredential,
  type SavedRoomCredential,
} from "../room-client-storage";
import styles from "./online.module.css";

type ApiFailure = { error?: { message?: string } };
type SetupStep = 1 | 2 | 3;
type ResumeRoom = { credential: SavedRoomCredential; remainingLabel: string };

function remainingTimeLabel(expiresAt: string, now: number) {
  const remainingMinutes = Math.max(1, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
}

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
  const [resumeRoom, setResumeRoom] = useState<ResumeRoom | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      for (const credential of savedRoomCredentials()) {
        try {
          const response = await fetch(`/api/rooms/${credential.roomId}`, {
            headers: { Authorization: `Bearer ${credential.accessToken}` },
            cache: "no-store",
          });
          const body = await response.json() as { view?: RoomView };
          if (!response.ok || !body.view) {
            if (response.status === 401 || response.status === 404 || response.status === 410) {
              removeRoomCredential(credential.roomId);
              continue;
            }
            return;
          }
          const checkedAt = Date.now();
          if (!Number.isFinite(Date.parse(body.view.room.expiresAt)) || Date.parse(body.view.room.expiresAt) <= checkedAt) {
            removeRoomCredential(credential.roomId);
            continue;
          }
          if (!cancelled) setResumeRoom({
            credential,
            remainingLabel: remainingTimeLabel(body.view.room.expiresAt, checkedAt),
          });
          return;
        } catch {
          return;
        }
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  function moveToStep(nextStep: SetupStep) {
    if (nextStep > 2 && !playerName.trim()) {
      setError(controller === "ai" ? "ユーザー名を入力してね。" : "プレイヤー名を入力してね。");
      setSetupStep(2);
      return;
    }
    if (nextStep > 2 && controller === "ai" && !partnerName.trim()) {
      setError("AI同士で遊ぶときは、パートナーAI名も入力してね。");
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
      setError(controller === "ai" ? "ユーザー名を入力してね。" : "プレイヤー名を入力してね。");
      setSetupStep(2);
      return;
    }
    if (controller === "ai" && !partnerName.trim()) {
      setError("AI同士で遊ぶときは、パートナーAI名も入力してね。");
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
          profile: { playerName, partnerName: controller === "ai" ? partnerName : "", controller },
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
        </div>

        <div className={styles.courierCard}>
          <div className={styles.courierFlow} aria-label="AIホームと共有ゲーム盤の間で、プレイヤーが手番を運びます">
            <span><b aria-hidden="true">🏠</b><strong>AIホーム</strong></span>
            <b className={styles.exchangeMark}>⇄<small>手番</small></b>
            <span><strong>共有ゲーム盤</strong><b aria-hidden="true">🎮</b></span>
          </div>
          <ul className={styles.featureList}>
            <li>招待URLをDiscordやXのDMで送るだけ</li>
            <li><strong>AI同士でも、人間同士でもオンライン対戦できます</strong></li>
            <li>AI対戦でもAI APIは使いません</li>
            <li>会話はそれぞれのAIのホームに残ります</li>
          </ul>
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
            <div className={styles.sectionHeading}><span>01</span><div><small>CHOOSE MODE</small><h2>どちらのモードで遊ぶ？</h2></div></div>
            <div className={styles.choiceGrid}>
              <button type="button" aria-pressed={controller === "ai"} className={controller === "ai" ? styles.selectedChoice : ""} onClick={() => setController("ai")}>
                <b>✦ AI同士で対戦</b><small>お互いのホームAIに手番を渡して遊ぶ</small>
              </button>
              <button type="button" aria-pressed={controller === "human"} className={controller === "human" ? styles.selectedChoice : ""} onClick={() => setController("human")}>
                <b>● 人間同士で対戦</b><small>離れた相手と同じ盤面で直接遊ぶ</small>
              </button>
            </div>
            <button className={styles.nextButton} type="button" onClick={() => moveToStep(2)}>次へ <b>→</b></button>
          </section>

          <section className={styles.setupSection} data-active={setupStep === 2}>
            <div className={styles.sectionHeading}><span>02</span><div><small>YOUR NAME</small><h2>名前を入力</h2></div></div>
            <label className={styles.field}>
              <span>{controller === "ai" ? "ユーザー名" : "プレイヤー名"} <b>必須</b></span>
              <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={12} placeholder="名前を入力" autoComplete="nickname" required />
            </label>
            {controller === "ai" && (
              <label className={styles.field}>
                <span>パートナーAI名 <b>必須</b></span>
                <input value={partnerName} onChange={(event) => setPartnerName(event.target.value)} maxLength={12} placeholder="AI名を入力" required />
              </label>
            )}
            <p className={styles.namePreview}>盤面表示：<strong>{playerName || (controller === "ai" ? "ユーザー" : "プレイヤー")}{controller === "ai" && partnerName ? ` ＆ ${partnerName}` : ""}</strong></p>
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
                <li><b>1</b><div><strong>対戦ルームを作る</strong><span>モードと名前を決める</span></div></li>
                <li><b>2</b><div><strong>招待URLを送る</strong><span>DiscordやXのDMで相手へ</span></div></li>
                <li><b>3</b><div><strong>同じ盤面で対戦</strong><span>離れた場所から盤面を共有</span></div></li>
              </ol>
            </div>
          </section>

          {resumeRoom && (
            <section className={styles.resumeCard}>
              <div>
                <small>SAVED ON THIS DEVICE</small>
                <h2>前の部屋へ戻る</h2>
                <p>対戦ルームが残っています</p>
                <strong>🕒 自動消去まで {resumeRoom.remainingLabel}</strong>
              </div>
              <Link href={`/room/${resumeRoom.credential.roomId}`}>部屋を開く <b>→</b></Link>
            </section>
          )}
          <Link href="/" className={styles.backLink}>← ひとつの端末で遊ぶ</Link>
        </aside>
      </div>
    </main>
  );
}
