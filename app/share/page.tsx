"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { winLinesFor, type BoardSize, type Player } from "../game-rules";
import { decodeShareState, type ShareState, type SharedPhase } from "../share-state";

function coordinate(index: number, boardSize: BoardSize) {
  return `${String.fromCharCode(65 + (index % boardSize))}${Math.floor(index / boardSize) + 1}`;
}

function phaseLabel(phase: SharedPhase, winner: ShareState["winner"]) {
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
  const threats = winLinesFor(state.boardSize).flatMap((line) => (["O", "X"] as Player[]).flatMap((player) => {
    const owned = line.filter((index) => state.claims[index] === player);
    const empty = line.filter((index) => !state.claims[index]);
    return owned.length === state.boardSize - 1 && empty.length === 1 ? [`${player}は${coordinate(empty[0], state.boardSize)}で勝利`]: [];
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
        const claim = state.claims[index] ? `${state.claims[index]}取得済み` : state.retryBlocked.includes(index) ? "空き（今回の再試行では選択不可）" : state.contestedCells?.includes(index) ? "空き（⚡争奪中・異議不可）" : "空き";
        return `${coordinate(index, state.boardSize)}｜カードID:${panel.id}｜見た目:${panel.visualDescription}｜登録読み:${panel.readings.join("・")}｜取得状態:${claim}｜現在の文字:${state.currentChar}｜戦況:${status}`;
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

        <section className={`share-board board-size-${state.boardSize}`} aria-label={`共有された${state.boardSize}×${state.boardSize}のゲーム盤。閲覧専用`}>
          {state.board.map((panel, index) => {
            const claim = state.claims[index];
            const winning = state.winningLine.includes(index);
            const blocked = state.retryBlocked.includes(index) && !claim;
            const contested = Boolean(state.contestedCells?.includes(index) && !claim);
            return (
              <article key={`${panel.id}-${index}`} className={`share-tile ${claim ? `claimed ${claim.toLowerCase()}` : ""} ${winning ? "winning" : ""} ${blocked ? "retry-blocked" : ""} ${contested ? "contested" : ""}`}>
                <span className="share-coordinate">{coordinate(index, state.boardSize)}</span>
                <span className="share-emoji" aria-hidden="true">{panel.icon}</span>
                <strong>{panel.name}</strong>
                <small>{claim ? `${claim}取得済み` : blocked ? "異議で選択不可" : contested ? "⚡ 争奪中" : "空き"}</small>
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
