"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Player = "O" | "X";
type Phase = "select" | "reading" | "partner-turn" | "partner-judge" | "local-judge" | "player-judge";

type SharePanel = {
  id: string;
  icon: string;
  name: string;
  category: string;
  readings: string[];
  visualDescription: string;
};

type ShareState = {
  v: 1;
  board: SharePanel[];
  claims: Array<Player | "">;
  currentChar: string;
  turn: Player;
  objections: [number, number];
  phase: Phase;
  winner: Player | "DRAW" | null;
  winningLine: number[];
  retryBlocked: number[];
};

const WIN_LINES = [
  [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
  [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
  [0, 5, 10, 15], [3, 6, 9, 12],
];

function coordinate(index: number) {
  return `${String.fromCharCode(65 + (index % 4))}${Math.floor(index / 4) + 1}`;
}

function decodeShareState(value: string): ShareState | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<ShareState>;
    if (
      parsed.v !== 1 ||
      !Array.isArray(parsed.board) || parsed.board.length !== 16 ||
      !Array.isArray(parsed.claims) || parsed.claims.length !== 16 ||
      !["O", "X"].includes(parsed.turn ?? "") ||
      typeof parsed.currentChar !== "string" ||
      !Array.isArray(parsed.objections) || parsed.objections.length !== 2 ||
      !Array.isArray(parsed.winningLine) || !Array.isArray(parsed.retryBlocked)
    ) return null;

    const validPanels = parsed.board.every((panel) => (
      panel && typeof panel.id === "string" && typeof panel.icon === "string" &&
      typeof panel.name === "string" && typeof panel.category === "string" &&
      typeof panel.visualDescription === "string" && Array.isArray(panel.readings)
    ));
    const validClaims = parsed.claims.every((claim) => claim === "" || claim === "O" || claim === "X");
    if (!validPanels || !validClaims) return null;
    return parsed as ShareState;
  } catch {
    return null;
  }
}

function phaseLabel(phase: Phase, winner: ShareState["winner"]) {
  if (winner === "DRAW") return "試合終了：引き分け";
  if (winner) return `試合終了：${winner}の勝利`;
  return {
    select: "札を選ぶ段階",
    reading: "読みを宣言する段階",
    "partner-turn": "パートナーの手番待ち",
    "partner-judge": "パートナーのこじつけ判定待ち",
    "local-judge": "対戦相手のこじつけ判定待ち",
    "player-judge": "あなたのこじつけ判定待ち",
  }[phase];
}

function battleSituation(state: ShareState) {
  const count = (player: Player) => state.claims.filter((claim) => claim === player).length;
  const threats = WIN_LINES.flatMap((line) => (["O", "X"] as Player[]).flatMap((player) => {
    const owned = line.filter((index) => state.claims[index] === player);
    const empty = line.filter((index) => !state.claims[index]);
    return owned.length === 3 && empty.length === 1 ? [`${player}は${coordinate(empty[0])}で勝利`]: [];
  }));
  return `○ ${count("O")}マス／× ${count("X")}マス。${threats.length ? `勝利候補：${threats.join("、")}` : "次の一手で完成するラインはなし。"}`;
}

export default function SharePage() {
  const [state, setState] = useState<ShareState | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setState(decodeShareState(new URLSearchParams(window.location.search).get("state") ?? ""));
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const aiText = useMemo(() => {
    if (!state) return "";
    const status = phaseLabel(state.phase, state.winner);
    return [
      "MIRROR WORD GRID 共有盤面（閲覧専用）",
      `現在の文字：${state.currentChar}`,
      `現在の手番：${state.turn === "O" ? "○" : "×"}`,
      `残り異議札：○ ${state.objections[0]}枚／× ${state.objections[1]}枚`,
      `現在の戦況：${battleSituation(state)}`,
      `進行状態：${status}`,
      "",
      "盤面：",
      ...state.board.map((panel, index) => {
        const claim = state.claims[index] ? `${state.claims[index]}取得済み` : state.retryBlocked.includes(index) ? "空き（今回の再試行では選択不可）" : "空き";
        return `${coordinate(index)}｜カードID:${panel.id}｜見た目:${panel.visualDescription}｜登録読み:${panel.readings.join("・")}｜取得状態:${claim}｜現在の文字:${state.currentChar}｜戦況:${status}`;
      }),
    ].join("\n");
  }, [state]);

  if (!loaded) {
    return <main className="share-shell"><p className="share-loading">共有盤面を読み込んでいます…</p></main>;
  }

  if (!state) {
    return (
      <main className="share-shell">
        <section className="share-card share-error" aria-live="polite">
          <p className="share-kicker">MIRROR WORD GRID</p>
          <h1>共有リンクを読み取れなかったよ</h1>
          <p>リンクが途中で切れているか、対応していない形式です。元のゲーム画面から、もう一度「盤面リンクをコピー」を押してね。</p>
          <Link className="share-home-link" href="/">ゲームへ戻る</Link>
        </section>
      </main>
    );
  }

  const status = phaseLabel(state.phase, state.winner);
  return (
    <main className="share-shell">
      <section className="share-card">
        <header className="share-header">
          <div><p className="share-kicker">MIRROR WORD GRID · VIEW ONLY</p><h1>共有された盤面</h1></div>
          <Link className="share-home-link" href="/">ゲームを開く</Link>
        </header>
        <p className="share-lead">このページは、その時点の盤面を確認するための閲覧専用ページです。ここから対戦状態は変更できません。</p>

        <section className="share-status" aria-label="現在の戦況">
          <div><small>現在の文字</small><strong>{state.currentChar}</strong></div>
          <div><small>手番</small><strong>{state.turn === "O" ? "○" : "×"}</strong></div>
          <div><small>残り異議札</small><strong>○ {state.objections[0]} / × {state.objections[1]}</strong></div>
          <div><small>進行状態</small><strong>{status}</strong></div>
        </section>

        <p className="share-battle"><b>現在の戦況：</b>{battleSituation(state)}</p>

        <section className="share-board" aria-label="共有された4×4のゲーム盤。閲覧専用">
          {state.board.map((panel, index) => {
            const claim = state.claims[index];
            const winning = state.winningLine.includes(index);
            const blocked = state.retryBlocked.includes(index) && !claim;
            return (
              <article key={`${panel.id}-${index}`} className={`share-tile ${claim ? `claimed ${claim.toLowerCase()}` : ""} ${winning ? "winning" : ""} ${blocked ? "retry-blocked" : ""}`}>
                <span className="share-coordinate">{coordinate(index)}</span>
                <span className="share-emoji" aria-hidden="true">{panel.icon}</span>
                <strong>{panel.name}</strong>
                <small>{claim ? `${claim}取得済み` : blocked ? "異議で選択不可" : "空き"}</small>
                {claim && <i className={`share-claim ${claim.toLowerCase()}`} aria-hidden="true" />}
              </article>
            );
          })}
        </section>

        <section className="share-ai-data" aria-label="AIが読み取るための盤面テキスト情報">
          <h2>AI用の盤面テキスト</h2>
          <p>座標・札ID・見た目・登録読み・取得状態・現在文字・戦況をHTML内に含めています。</p>
          <pre>{aiText}</pre>
        </section>
      </section>
    </main>
  );
}
