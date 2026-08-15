"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { readingEnd, type Player } from "../../game-rules";
import {
  coordinateForIndex,
  oppositeSide,
  presetChoices,
  profileLabel,
  proposalLabel,
} from "../../online-engine";
import {
  buildAiIntroPrompt,
  buildAiJudgePrompt,
  buildAiTurnPrompt,
  parseAiJudgeReply,
  parseAiTurnReply,
} from "../../online-prompts";
import type { ControllerKind, PlayerProfile, RoomAction, RoomView } from "../../online-types";
import {
  copyText,
  credentialForRoom,
  saveRoomCredential,
} from "../../room-client-storage";
import styles from "./room.module.css";

type ApiPayload = {
  view?: RoomView;
  error?: { code?: string; message?: string };
};

function sideName(side: Player) {
  return side === "O" ? "○側" : "×側";
}

function formatExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "24時間後";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function RoomClient({ roomId }: { roomId: string }) {
  const [accessToken, setAccessToken] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [view, setView] = useState<RoomView | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncState, setSyncState] = useState<"online" | "syncing" | "offline">("syncing");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [customDisplay, setCustomDisplay] = useState("");
  const [customAid, setCustomAid] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [judgeReason, setJudgeReason] = useState("");
  const [copiedKind, setCopiedKind] = useState<"invite" | "intro" | "turn" | "judge" | null>(null);
  const lastChangeAt = useRef(0);
  const revisionRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = credentialForRoom(roomId);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const guestToken = hash.get("guest") ?? "";
      let credential = saved;

      if (guestToken && saved?.side === "O") {
        setNotice("この端末はホストとして保存済みなので、ホスト権限のまま開いたよ。招待URLは相手の端末で開いてね。");
      } else if (guestToken) {
        credential = { roomId, accessToken: guestToken, side: "X", savedAt: new Date().toISOString() };
        saveRoomCredential(credential);
      }

      if (window.location.hash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      if (!credential) {
        setError("この端末に参加情報がありません。ホストが送った招待URLを開いてね。");
        setBooting(false);
        return;
      }
      setAccessToken(credential.accessToken);
      setInviteToken(credential.inviteToken ?? "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [roomId]);

  const loadRoom = useCallback(async (quiet = false) => {
    if (!accessToken) return;
    if (!quiet) setSyncState("syncing");
    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await response.json() as ApiPayload;
      if (!response.ok || !body.view) throw new Error(body.error?.message ?? "部屋を読み込めませんでした。");
      if (revisionRef.current !== null && revisionRef.current !== body.view.room.revision) lastChangeAt.current = Date.now();
      revisionRef.current = body.view.room.revision;
      setView(body.view);
      setError("");
      setSyncState("online");
      saveRoomCredential({ roomId, accessToken, side: body.view.you, savedAt: new Date().toISOString() });
    } catch (reason) {
      setSyncState("offline");
      if (!quiet) setError(reason instanceof Error ? reason.message : "部屋を読み込めませんでした。");
    } finally {
      setBooting(false);
    }
  }, [accessToken, roomId]);

  useEffect(() => {
    if (!accessToken) return;
    const timer = window.setTimeout(() => void loadRoom(false), 0);
    return () => window.clearTimeout(timer);
  }, [accessToken, loadRoom]);

  const activeRoomId = view?.room.id;
  useEffect(() => {
    if (!accessToken || !activeRoomId) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      await loadRoom(true);
      if (cancelled) return;
      const recentlyChanged = Date.now() - lastChangeAt.current < 15_000;
      const delay = document.hidden ? 8_000 : recentlyChanged ? 2_000 : 5_000;
      timer = window.setTimeout(poll, delay);
    };
    timer = window.setTimeout(poll, 2_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [accessToken, activeRoomId, loadRoom]);

  async function sendAction(action: RoomAction) {
    if (!view || busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    setSyncState("syncing");
    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ expectedRevision: view.room.revision, action }),
      });
      const body = await response.json() as ApiPayload;
      if (response.status === 409 && body.view) {
        setView(body.view);
        revisionRef.current = body.view.room.revision;
        setNotice(body.error?.message ?? "相手の操作を先に反映したよ。最新の盤面を確認してね。");
        setSyncState("online");
        return false;
      }
      if (!response.ok || !body.view) throw new Error(body.error?.message ?? "操作を反映できませんでした。");
      setView(body.view);
      revisionRef.current = body.view.room.revision;
      lastChangeAt.current = Date.now();
      setSyncState("online");
      return true;
    } catch (reason) {
      setSyncState("offline");
      setError(reason instanceof Error ? reason.message : "操作を反映できませんでした。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function copy(kind: typeof copiedKind, text: string) {
    const copied = await copyText(text);
    if (!copied) {
      setError("コピーできませんでした。文章を長押ししてコピーしてね。");
      return;
    }
    setCopiedKind(kind);
    setNotice(kind === "invite" ? "招待URLをコピーしたよ。DiscordやXのDMで相手へ送ってね。" : "コピーしたよ。いつものAIとの会話へ貼ってね。");
  }

  if (booting) {
    return (
      <main className={styles.loadingShell}>
        <Image src="/mirror-word-grid-logo.png" alt="MIRROR WORD GRID" width={835} height={483} priority unoptimized />
        <div className={styles.loadingDots}><i /><i /><i /></div>
        <p>対戦部屋へ接続中…</p>
      </main>
    );
  }

  if (!view) {
    return (
      <main className={styles.errorShell}>
        <Image src="/mirror-word-grid-logo.png" alt="MIRROR WORD GRID" width={835} height={483} priority unoptimized />
        <section><span>ROOM NOT FOUND</span><h1>部屋を開けなかったよ。</h1><p>{error}</p><Link href="/online">オンライン対戦トップへ</Link></section>
      </main>
    );
  }

  const room = view.room;
  const game = room.game;
  const you = view.you;
  const participant = room.players[you];
  const controller = participant?.profile.controller ?? "human";
  const roomMode = room.players.O?.profile.controller ?? "human";
  const yourTurn = room.status === "active" && game.phase === "select" && game.turn === you;
  const yourJudgement = room.status === "active" && game.phase === "judge" && game.proposal?.player !== you;
  const selectedStillValid = selectedIndex !== null && yourTurn && controller === "human" && !game.claims[selectedIndex] && !game.retryBlocked.includes(selectedIndex);
  const activeSelectedIndex = selectedStillValid ? selectedIndex : null;
  const selectedPanel = activeSelectedIndex === null ? null : game.board[activeSelectedIndex];
  const choices = selectedPanel ? presetChoices(selectedPanel, game.currentChar) : [];
  const oLabel = profileLabel(room.players.O?.profile);
  const xLabel = profileLabel(room.players.X?.profile);
  const boardStyle = { "--online-board-size": game.boardSize } as CSSProperties;

  async function joinRoom(profile: PlayerProfile) {
    await sendAction({ type: "join", profile });
  }

  async function declarePreset(display: string, reading: string) {
    if (activeSelectedIndex === null) return;
    if (await sendAction({ type: "declare", panelIndex: activeSelectedIndex, display, readingAid: reading })) {
      setSelectedIndex(null);
      setCustomDisplay("");
      setCustomAid("");
      setCustomReason("");
    }
  }

  async function declareCustom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeSelectedIndex === null) return;
    if (await sendAction({ type: "declare", panelIndex: activeSelectedIndex, display: customDisplay, readingAid: customAid, reason: customReason })) {
      setSelectedIndex(null);
      setCustomDisplay("");
      setCustomAid("");
      setCustomReason("");
    }
  }

  async function reflectAiTurn() {
    const parsed = parseAiTurnReply(room, aiReply);
    if (!parsed.ok) return setError(parsed.error);
    if (await sendAction(parsed.action)) setAiReply("");
  }

  async function reflectAiJudge() {
    const parsed = parseAiJudgeReply(room, aiReply);
    if (!parsed.ok) return setError(parsed.error);
    if (await sendAction(parsed.action)) setAiReply("");
  }

  const inviteUrl = inviteToken && typeof window !== "undefined"
    ? `${window.location.origin}/room/${room.id}#guest=${inviteToken}`
    : "";

  return (
    <main className={styles.roomShell}>
      <header className={styles.roomHeader}>
        <Link href="/online" className={styles.roomLogo} aria-label="オンライン対戦トップへ"><Image src="/mirror-word-grid-logo.png" alt="MIRROR WORD GRID" width={835} height={483} priority unoptimized /></Link>
        <div className={`${styles.syncBadge} ${styles[syncState]}`}><i />{syncState === "online" ? "同期中" : syncState === "syncing" ? "更新中" : "再接続中"}</div>
      </header>

      <section className={styles.matchBanner}>
        <div className={styles.sideO}><i>○</i><span>{oLabel}</span>{you === "O" && <small>あなた側</small>}</div>
        <strong>VS</strong>
        <div className={styles.sideX}><i>×</i><span>{xLabel}</span>{you === "X" && <small>あなた側</small>}</div>
      </section>

      {(notice || error) && <div className={error ? styles.errorNotice : styles.notice} role={error ? "alert" : "status"}>{error || notice}</div>}

      {you === "X" && !room.players.X ? (
        <JoinCard busy={busy} mode={roomMode} onJoin={joinRoom} />
      ) : (
        <div className={styles.roomLayout}>
          <div className={styles.playColumn}>
            {room.status === "waiting" ? (
              <WaitingRoom
                room={room}
                you={you}
                inviteUrl={inviteUrl}
                inviteCopied={copiedKind === "invite"}
                busy={busy}
                onCopyInvite={() => inviteUrl && copy("invite", inviteUrl)}
                onStart={() => sendAction({ type: "start" })}
              />
            ) : (
              <>
                <section className={styles.turnStatus}>
                  <div><small>{game.phase === "judge" ? "判定する側" : "いまの手番"}</small><strong>{game.phase === "judge" && game.proposal ? profileLabel(room.players[oppositeSide(game.proposal.player)]?.profile) : profileLabel(room.players[game.turn]?.profile)}</strong></div>
                  <div><small>この文字から</small><strong>{game.currentChar}</strong></div>
                  <div><small>残り異議札</small><span><b>○</b>{game.objections.O} <b>×</b>{game.objections.X}</span></div>
                </section>

                <section className={styles.board} style={boardStyle} aria-label={`${game.boardSize}×${game.boardSize}の共有ゲーム盤`}>
                  {game.board.map((panel, index) => {
                    const owner = game.claims[index];
                    const blocked = game.retryBlocked.includes(index) && !owner;
                    const selected = index === activeSelectedIndex;
                    const winning = game.winningLine.includes(index);
                    const selectable = yourTurn && controller === "human" && !owner && !blocked;
                    return (
                      <button
                        type="button"
                        key={`${panel.id}-${index}`}
                        disabled={!selectable}
                        onClick={() => selectable && setSelectedIndex(index)}
                        className={[styles.tile, owner ? styles[`claimed${owner}`] : "", blocked ? styles.blocked : "", selected ? styles.selected : "", winning ? styles.winning : ""].filter(Boolean).join(" ")}
                        aria-label={`${coordinateForIndex(index, game.boardSize)} ${panel.name}${owner ? ` ${sideName(owner)}が取得済み` : blocked ? " 今回選択不可" : ""}`}
                      >
                        <small>{coordinateForIndex(index, game.boardSize)}</small>
                        <span aria-hidden="true">{panel.icon}</span>
                        <b>{panel.name}</b>
                        {owner && <i aria-hidden="true">{owner === "O" ? "○" : "×"}</i>}
                        {blocked && <em>異議</em>}
                      </button>
                    );
                  })}
                </section>

                <section className={styles.actionCard}>
                  {room.status === "closed" && <SimpleMessage title="この部屋は終了しました" text="新しい部屋を作って、もう一局遊べるよ。" />}
                  {room.status === "finished" && <WinnerCard room={room} />}

                  {room.status === "active" && game.phase === "select" && !yourTurn && (
                    <SimpleMessage title={`${profileLabel(room.players[game.turn]?.profile)}の手番`} text="盤面は自動で更新されるよ。相手の一手を待ってね。" pulse />
                  )}
                  {room.status === "active" && game.phase === "select" && yourTurn && controller === "human" && !selectedPanel && (
                    <SimpleMessage title="あなたの手番！" text={`「${game.currentChar}」から読める札を、共有盤面から選んでね。`} pointer />
                  )}
                  {room.status === "active" && game.phase === "select" && yourTurn && controller === "human" && selectedPanel && activeSelectedIndex !== null && (
                    <ReadingCard
                      coordinate={coordinateForIndex(activeSelectedIndex, game.boardSize)}
                      panel={selectedPanel}
                      currentChar={game.currentChar}
                      choices={choices}
                      customDisplay={customDisplay}
                      customAid={customAid}
                      customReason={customReason}
                      busy={busy}
                      onDisplay={setCustomDisplay}
                      onAid={setCustomAid}
                      onReason={setCustomReason}
                      onPreset={declarePreset}
                      onCancel={() => setSelectedIndex(null)}
                      onSubmit={declareCustom}
                    />
                  )}
                  {room.status === "active" && game.phase === "select" && yourTurn && controller === "ai" && (
                    <AiRelayCard
                      kind="turn"
                      prompt={buildAiTurnPrompt(room, you)}
                      reply={aiReply}
                      copied={copiedKind === "turn"}
                      busy={busy}
                      onReply={setAiReply}
                      onCopy={() => copy("turn", buildAiTurnPrompt(room, you))}
                      onReflect={reflectAiTurn}
                    />
                  )}

                  {room.status === "active" && game.phase === "judge" && game.proposal && !yourJudgement && (
                    <ProposalWaiting room={room} />
                  )}
                  {room.status === "active" && game.phase === "judge" && game.proposal && yourJudgement && controller === "human" && (
                    <JudgeCard room={room} reason={judgeReason} busy={busy} onReason={setJudgeReason} onJudge={async (verdict) => {
                      if (await sendAction({ type: "judge", verdict, reason: verdict === "accept" ? "" : judgeReason })) setJudgeReason("");
                    }} />
                  )}
                  {room.status === "active" && game.phase === "judge" && game.proposal && yourJudgement && controller === "ai" && (
                    <AiRelayCard
                      kind="judge"
                      prompt={buildAiJudgePrompt(room, you)}
                      reply={aiReply}
                      copied={copiedKind === "judge"}
                      busy={busy}
                      onReply={setAiReply}
                      onCopy={() => copy("judge", buildAiJudgePrompt(room, you))}
                      onReflect={reflectAiJudge}
                    />
                  )}
                </section>
              </>
            )}
          </div>

          <aside className={styles.sideColumn}>
            {participant?.profile.controller === "ai" && (
              <section className={styles.aiPrepCard}>
                <small>YOUR AI HOME</small><h2>{participant.profile.partnerName}へルール共有</h2>
                <p>対戦の最初に一度だけ渡しておくと、手番文だけで迷わず参加できるよ。</p>
                <button type="button" onClick={() => copy("intro", buildAiIntroPrompt(room, you))}>{copiedKind === "intro" ? "✓ もう一度コピー" : "⧉ 対戦開始文をコピー"}</button>
              </section>
            )}
            <section className={styles.roomInfoCard}>
              <small>ROOM INFO</small><h2>対戦ルーム</h2>
              <dl><div><dt>部屋ID</dt><dd>{room.id}</dd></div><div><dt>盤面</dt><dd>{game.boardSize}×{game.boardSize}</dd></div><div><dt>先攻</dt><dd>{profileLabel(room.players[game.startingPlayer]?.profile)}</dd></div><div><dt>自動消去</dt><dd>{formatExpiry(room.expiresAt)}</dd></div></dl>
              <p>有効な操作のたびに期限が24時間延長されます。見るだけでは延長されません。</p>
            </section>
            <section className={styles.historyCard}>
              <small>PLAY LOG</small><h2>ことばの足あと</h2>
              {game.history.length ? <ol>{[...game.history].reverse().slice(0, 12).map((item, index) => <li key={`${item.coordinate}-${index}`}><i className={item.player === "O" ? styles.logO : styles.logX}>{item.player === "O" ? "○" : "×"}</i><span>{item.coordinate}</span><strong>{item.reading}</strong></li>)}</ol> : <p>最初の一手を待ってるよ。</p>}
            </section>
            <Link href="/online" className={styles.newRoomLink}>＋ 新しい部屋を作る</Link>
          </aside>
        </div>
      )}
    </main>
  );
}

function JoinCard({ busy, mode, onJoin }: { busy: boolean; mode: ControllerKind; onJoin: (profile: PlayerProfile) => Promise<void> }) {
  const [playerName, setPlayerName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const aiMatch = mode === "ai";
  return (
    <section className={styles.joinCard}>
      <p className={styles.joinKicker}>YOU ARE INVITED!</p><h1>対戦ルームへようこそ。</h1>
      <p>{aiMatch ? "✦ AI同士のオンライン対戦です。ユーザー名とパートナーAI名を入力してね。" : "● 人間同士のオンライン対戦です。プレイヤー名を入力してね。"}</p>
      <form onSubmit={(event) => { event.preventDefault(); void onJoin({ playerName, partnerName: aiMatch ? partnerName : "", controller: mode }); }}>
        <label><span>{aiMatch ? "ユーザー名" : "プレイヤー名"} <b>必須</b></span><input value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={12} placeholder="名前を入力" required /></label>
        {aiMatch && <label><span>パートナーAI名 <b>必須</b></span><input value={partnerName} onChange={(event) => setPartnerName(event.target.value)} maxLength={12} placeholder="AI名を入力" required /></label>}
        <p>盤面表示：<strong>{playerName || (aiMatch ? "ユーザー" : "プレイヤー")}{aiMatch && partnerName ? ` ＆ ${partnerName}` : ""}</strong></p>
        <button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? "参加中…" : "この名前で参加する →"}</button>
      </form>
    </section>
  );
}

function WaitingRoom({ room, you, inviteUrl, inviteCopied, busy, onCopyInvite, onStart }: {
  room: RoomView["room"];
  you: Player;
  inviteUrl: string;
  inviteCopied: boolean;
  busy: boolean;
  onCopyInvite: () => void;
  onStart: () => void;
}) {
  const guestJoined = Boolean(room.players.X);
  return (
    <section className={styles.waitingCard}>
      <div className={styles.waitingIcon}>{guestJoined ? "✓" : "↗"}</div>
      <p>WAITING ROOM</p>
      <h1>{guestJoined ? "ふたり、そろったよ！" : "相手を招待しよう。"}</h1>
      {!guestJoined && you === "O" && <><p>このURLをDiscordやXのDMで相手へ送ってね。URLの秘密部分はブラウザの履歴以外の通常リクエストには送られません。</p>{inviteUrl ? <button className={styles.inviteButton} type="button" onClick={onCopyInvite}>{inviteCopied ? "✓ 招待URLをもう一度コピー" : "⧉ 招待URLをコピー"}</button> : <p className={styles.missingInvite}>招待情報がこの端末から失われています。新しい部屋を作り直してね。</p>}</>}
      {!guestJoined && you === "X" && <p>参加できたよ。ホストがこの画面を確認するまで少し待ってね。</p>}
      {guestJoined && <div className={styles.readyPair}><span>○ {profileLabel(room.players.O?.profile)}</span><b>VS</b><span>× {profileLabel(room.players.X?.profile)}</span></div>}
      {guestJoined && you === "O" && <button className={styles.startMatchButton} type="button" disabled={busy} onClick={onStart}>{busy ? "開始中…" : "この二人で対戦を始める →"}</button>}
      {guestJoined && you === "X" && <p className={styles.waitPulse}>ホストのスタートを待っています…</p>}
    </section>
  );
}

function SimpleMessage({ title, text, pulse = false, pointer = false }: { title: string; text: string; pulse?: boolean; pointer?: boolean }) {
  return <div className={`${styles.simpleMessage} ${pulse ? styles.pulse : ""}`}><span>{pointer ? "☝️" : pulse ? "…" : "✦"}</span><div><h2>{title}</h2><p>{text}</p></div></div>;
}

function ReadingCard({ coordinate, panel, currentChar, choices, customDisplay, customAid, customReason, busy, onDisplay, onAid, onReason, onPreset, onCancel, onSubmit }: {
  coordinate: string;
  panel: RoomView["room"]["game"]["board"][number];
  currentChar: string;
  choices: Array<{ display: string; reading: string }>;
  customDisplay: string;
  customAid: string;
  customReason: string;
  busy: boolean;
  onDisplay: (value: string) => void;
  onAid: (value: string) => void;
  onReason: (value: string) => void;
  onPreset: (display: string, reading: string) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className={styles.readingCard}>
      <div className={styles.selectedPanel}><span>{panel.icon}</span><div><small>{coordinate} / {panel.category}</small><h2>{panel.name}</h2></div></div>
      {choices.length ? <div className={styles.presetList}><small>「{currentChar}」から使える正式読み</small><div>{choices.map((choice) => <button type="button" disabled={busy} key={`${choice.display}-${choice.reading}`} onClick={() => onPreset(choice.display, choice.reading)}>{choice.display}<span>{readingEnd(choice.reading) === "ん" ? "⚠ んで即負け" : `→ ${readingEnd(choice.reading)}`}</span></button>)}</div></div> : <p className={styles.noPreset}>つながる正式読みはなし。自由読みの出番！</p>}
      <form className={styles.customForm} onSubmit={onSubmit}>
        <label><span>自由読みの表示 <b>漢字もOK</b></span><input value={customDisplay} onChange={(event) => onDisplay(event.target.value)} maxLength={48} placeholder={`例：${currentChar}…`} required /></label>
        <label><span>判定用の読み仮名 <b>漢字表示の時は必須</b></span><input value={customAid} onChange={(event) => onAid(event.target.value)} maxLength={48} placeholder="ひらがな／カタカナ" /></label>
        <label><span>そう読んだ理由 <b>必須</b></span><textarea value={customReason} onChange={(event) => onReason(event.target.value)} maxLength={240} rows={3} placeholder="絵のどこから、どう読んだ？" required /></label>
        <div><button type="button" onClick={onCancel}>選び直す</button><button type="submit" disabled={busy}>{busy ? "送信中…" : "この読みで宣言"}</button></div>
      </form>
    </div>
  );
}

function AiRelayCard({ kind, prompt, reply, copied, busy, onReply, onCopy, onReflect }: {
  kind: "turn" | "judge";
  prompt: string;
  reply: string;
  copied: boolean;
  busy: boolean;
  onReply: (value: string) => void;
  onCopy: () => void;
  onReflect: () => void;
}) {
  return (
    <div className={styles.aiRelayCard}>
      <p>{kind === "turn" ? "AI PARTNER TURN" : "AI PARTNER JUDGEMENT"}</p><h2>{kind === "turn" ? "ホームAIへ手番を渡す" : "ホームAIへ判定を頼む"}</h2>
      <span className={styles.actionCode}>手番コード <b>{prompt.match(/MWG-[A-Z0-9]+/u)?.[0] ?? "—"}</b></span>
      <button type="button" className={styles.copyPromptButton} onClick={onCopy}>{copied ? "✓ もう一度コピー" : kind === "turn" ? "⧉ この手番をコピー" : "⧉ 判定依頼をコピー"}</button>
      <label><span>AIの返答をここへ貼る</span><textarea rows={7} value={reply} onChange={(event) => onReply(event.target.value)} placeholder="回答全文でも、最後の【】1行だけでも読み取れるよ。" /></label>
      <button type="button" className={styles.reflectButton} disabled={busy || !reply.trim()} onClick={onReflect}>{busy ? "反映中…" : "返答を共有盤面へ反映"}</button>
      <details><summary>AIへ渡す文章を確認</summary><pre>{prompt}</pre></details>
    </div>
  );
}

function ProposalView({ room }: { room: RoomView["room"] }) {
  const proposal = room.game.proposal!;
  const panel = room.game.board[proposal.panelIndex];
  return <div className={styles.proposal}><span>{panel.icon}</span><div><small>{coordinateForIndex(proposal.panelIndex, room.game.boardSize)} / {panel.name}</small><h2>「{proposalLabel(proposal)}」</h2><p>{proposal.reason}</p></div></div>;
}

function ProposalWaiting({ room }: { room: RoomView["room"] }) {
  const judge = oppositeSide(room.game.proposal!.player);
  return <div className={styles.proposalWaiting}><ProposalView room={room} /><p><b>{profileLabel(room.players[judge]?.profile)}</b>が自由読みを判定中…</p></div>;
}

function JudgeCard({ room, reason, busy, onReason, onJudge }: {
  room: RoomView["room"];
  reason: string;
  busy: boolean;
  onReason: (value: string) => void;
  onJudge: (verdict: "accept" | "objection" | "not-established") => void;
}) {
  const you = oppositeSide(room.game.proposal!.player);
  const canObject = room.game.objections[you] > 0 && !room.game.objectionUsedThisTurn[you];
  return (
    <div className={styles.judgeCard}>
      <p>FREE READING CHECK</p><h2>この自由読み、どうする？</h2><ProposalView room={room} />
      <p className={styles.judgeGuide}>成立しているなら受理。成立するけど勝負上止めたいなら異議。札との意味的なつながりがかなり遠いなら不成立にできるよ。</p>
      <label><span>異議・不成立の理由</span><textarea value={reason} onChange={(event) => onReason(event.target.value)} maxLength={240} rows={2} placeholder="理由を短く書いてね" /></label>
      <div className={styles.judgeButtons}><button type="button" disabled={busy || !reason.trim()} onClick={() => onJudge("not-established")}>× 不成立<small>札は減らない</small></button><button type="button" disabled={busy || !canObject || !reason.trim()} onClick={() => onJudge("objection")}>⚡ 異議<small>{canObject ? "1枚使う" : "現在使用不可"}</small></button><button type="button" disabled={busy} onClick={() => onJudge("accept")}>✓ 受理<small>読みを成立</small></button></div>
    </div>
  );
}

function WinnerCard({ room }: { room: RoomView["room"] }) {
  const game = room.game;
  const winner = game.winner;
  const title = winner === "DRAW" ? "引き分け！" : winner ? `${profileLabel(room.players[winner]?.profile)}の勝ち！` : "対戦終了";
  const reason = game.winReason === "n-ending" ? "「ん」で終わる読みが宣言され、その場で勝負が決まりました。" : winner === "DRAW" ? "双方ともラインを完成できなくなりました。" : `${game.boardSize}枚のラインがそろったよ。`;
  return <div className={styles.winnerCard}><span>✦ ○ ✧ × ✦</span><p>GAME SET!</p><h2>{title}</h2><p>{reason}</p><Link href="/online">もう一局の部屋を作る →</Link></div>;
}
