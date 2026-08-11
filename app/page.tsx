"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import {
  availablePresetReadings,
  findWinner,
  hasArtificialPolitePrefix,
  isRegistered,
  isRepeatedRejectedReading,
  nextRetryBlocks,
  normalizeReading,
  presetReadingDisplay,
  presetReadingValue,
  readingEnd,
  readingStartsWith,
  winnerAfterNEnding,
  type Panel,
  type Player,
  type RejectedAttempt,
  WIN_LINES_4,
} from "./game-rules";
import { PANELS } from "./panel-dictionary";
import { encodeShareState } from "./share-state";

type Mode = "partner" | "local";
type View = "loading" | "title" | "tutorial" | "guide" | "resume" | "mode" | "confirm" | "countdown" | "game";
type BearMood = "happy" | "thinking" | "firm" | "surprised" | "wink" | "cheer";
type ShuMotion = "idle" | "point" | "explain" | "surprise" | "cheer" | "gone";
type MiuMotion = "idle" | "ready" | "thinking" | "accept" | "reject" | "panic" | "gone" | "shock" | "lose";
type TutorialChatKind = "intro" | "turn" | "judge";
type TutorialChatPhase = "empty" | "pasted" | "replied";
type TutorialEvent = "gone" | "objection" | "victory";
type Phase =
  | "select"
  | "reading"
  | "partner-turn"
  | "partner-judge"
  | "local-judge"
  | "player-judge";

type Proposal = {
  player: Player;
  panelIndex: number;
  reading: string;
  reason: string;
  custom: boolean;
};

type HistoryItem = {
  player: Player;
  coordinate: string;
  reading: string;
};

type GameState = {
  board: Panel[];
  claims: Record<number, Player>;
  turn: Player;
  currentChar: string;
  phase: Phase;
  selectedIndex: number | null;
  objections: Record<Player, number>;
  activeCode: string;
  usedCodes: string[];
  copied: boolean;
  proposal: Proposal | null;
  winner: Player | "DRAW" | null;
  winReason: "line" | "draw" | "n-ending" | null;
  winningLine: number[];
  history: HistoryItem[];
  mode: Mode;
  retryBlocked: number[];
  rejectedAttempts: RejectedAttempt[];
  partnerBriefed: boolean;
  seed: number;
};

const SPINES = [
  { start: "か", ids: ["umbrella", "flying-fish", "eggplant", "watermelon", "frog-prince", "ruby", "dog", "plush", "mirror", "storm"] },
  { start: "ね", ids: ["box-cat", "moon-coffee", "cake", "mushroom", "top", "pillow", "radio", "crown", "mirror", "moon"] },
  { start: "つ", ids: ["moon", "mushroom", "top", "pillow", "radio", "crown", "mirror", "frog-prince", "ruby", "dog"] },
];

const WIN_LINES = WIN_LINES_4;

const STORAGE_KEY = "mirror-word-grid-prototype-v2";
const PRACTICE_PROVISIONAL_STILLS: Record<string, string> = {
  "shu-idle": "/practice/provisional/shu-neutral.png",
  "shu-point": "/practice/provisional/shu-point.png",
  "shu-explain": "/practice/provisional/shu-point.png",
  "shu-surprise": "/practice/provisional/shu-question.png",
  "shu-cheer": "/practice/provisional/shu-sparkle.png",
  "shu-gone": "/practice/provisional/shu-hearts.png",
  "miu-idle": "/practice/provisional/miu-neutral.png",
  "miu-ready": "/practice/provisional/miu-jump.png",
  "miu-thinking": "/practice/provisional/miu-delight.png",
  "miu-accept": "/practice/provisional/miu-wink.png",
  "miu-reject": "/practice/provisional/miu-grumpy.png",
  "miu-panic": "/practice/provisional/miu-delight.png",
  "miu-gone": "/practice/provisional/miu-wink.png",
  "miu-shock": "/practice/provisional/miu-delight.png",
  "miu-lose": "/practice/provisional/miu-grumpy.png",
};
const TUTORIAL_PANELS = [
  { id: "umbrella", icon: "☔", name: "かさ", reading: "かさ" },
  { id: "top", icon: "♾️", name: "無限", reading: "ループ" },
  { id: "glasses", icon: "👓", name: "めがね", reading: "まじめ" },
  { id: "crying-face", icon: "😭", name: "なきがお", reading: "なきがお" },
  { id: "cloud", icon: "☁️", name: "くも", reading: "くも" },
  { id: "mail", icon: "✉️", name: "メール", reading: "メール" },
  { id: "moon", icon: "🌙", name: "おつきさま", reading: "おつきさま" },
  { id: "flying-fish", icon: "🐟", name: "さかな", reading: "さかな" },
  { id: "christmas-tree", icon: "🎄", name: "ツリー", reading: "メリークリスマス" },
] as const;
const TUTORIAL_TITLES = [
  "『か』を探そう",
  "☔は『かさ』！",
  "次はみうの番",
  "みうへ手番を渡そう",
  "みうの返答を戻そう",
  "次は『な』！",
  "😭は『なきがお』",
  "みうは『おつきさま』",
  "……さて。ここからが本番！",
  "♾️を『まるまる』に！",
  "このゴネをみうへ",
  "みうが考え中……",
  "今回は却下っ🙅",
  "却下の次もゴネていい！",
  "👓を『まじめ』に！",
  "むむ……今回は受理！",
  "リーチ！みうが焦ってる",
  "異議札で止めよう！",
  "『る』から勝ち札を探そう",
  "♾️は正式読み『ループ』！",
  "3枚そろったーー！！🎉",
] as const;

const TUTORIAL_CHAPTERS = [
  "基本のしりとり",
  "ゴネに挑戦！",
  "異議札を使おう！",
  "勝ちにいこう！",
] as const;

const TUTORIAL_CHAT = {
  intro: {
    prompt: "# MIRROR WORD GRID：模擬戦開始\nあなたはAI代理みう（×側）です。しりとりで3×3の札を取り、先に一列そろえた側が勝ちです。正式プリセットはそのまま成立し、自由読みには理由が必要です。お互いに異議札を1枚持ちます。理解したら、まだ一手を選ばず、あなたらしい言葉で準備できたことを伝えてください。会話は普通の文章で返し、コピー用の【準備:OK】の1行だけを、独立したMarkdownコードブロックに入れて最後に付けてください。前後の会話はコードブロックに入れないでください。",
    reply: "【準備:OK】",
    replyLabel: "ルール受け取ったよー！ 準備OK！ 一緒に遊ぼうっ✨",
  },
  turn: {
    prompt: "# 練習手番\nあなたはAI代理みう（×側）です。現在文字は「さ」。3×3盤面から一手を選んでください。会話や説明は普通の文章で返し、コピー用の【手番:B3｜読み:さかな】の1行だけを、独立したMarkdownコードブロックに入れて最後に付けてください。会話全体や説明文はコードブロックに入れないでください。",
    reply: "【手番:B3｜読み:さかな】",
    replyLabel: "『さ』だね。じゃあ、さかな！🐟",
  },
  judge: {
    prompt: "# 練習判定\n○側はB1の♾️を「まるまる」（まるが2つあるから！）と自由読みしました。あなたは異議札を1枚持っています。会話や説明は普通の文章で返し、コピー用の【判定:異議｜理由:その読みは無理があり、上段の勝ち筋も止めたい】の1行だけを、独立したMarkdownコードブロックに入れて最後に付けてください。会話全体や説明文はコードブロックに入れないでください。",
    reply: "【判定:異議｜理由:その読みは無理があり、上段の勝ち筋も止めたい】",
    replyLabel: "う〜ん……それはちょっと強引！ 今回は却下っ🙅",
  },
} as const;

const TUTORIAL_SHU_NOTES = [
  "まずは普通のしりとり。『か』から始まる札を探してみよう！",
  "そうそう！正式プリセットは、理由なしでそのまま使えるよ。",
  "『かさ』の最後は『さ』。次はみうへ手番を渡そう！",
  "コピーした文を練習窓へ貼って、みうに送ってみよう。",
  "返答は【】の1行だけを戻すよ。前後のおしゃべりはそのままでOK！",
  "みうの『さかな』で、次は『な』。見つけてみよう！",
  "😭の『なきがお』ならつながるね。次の文字は『お』！",
  "みうは🌙を『おつきさま』で取るよ。ここまでは普通のしりとり。",
  "でもMIRROR WORD GRIDは――ここからが本番！",
  "今回は♾️を『まるまる』、理由は『まるが2つあるから！』。しゅがお手本を入力しておいたよ。",
  "自由読みは相手に判定してもらう。ゴネをみうへ渡そう！",
  "みうも勝ちたいから、納得できるか・止めたいかを考えるよ。",
  "却下されても失敗じゃない！ やり合うところまでが、このゲームの遊びだよ。",
  "じゃあ、もう一回！ 今度は👓を『まじめ』でゴネてみよう。",
  "こういう一段ひねった読みもアリ！ 今回もしゅがお手本を入力しておいたよ。",
  "むむ……それなら分かる。今回は受理！ 成立の瞬間を自分で押そう。",
  "おっ、こっちがリーチ！ みうも焦って、先に勝ちにいくため自分からゴネてきた！",
  "通したくない読みには異議札。×で『メリークリスマス』を止めよう！",
  "みうは✉️の正式読み『メール』へ変更。次は『る』だよ。",
  "却下されたのは『まるまる』だけ。♾️の正式読み『ループ』は使える！",
  "正式読みも自由読みも、駆け引きに使ってラインを作れたね！",
] as const;
function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => ((value = (value * 16807) % 2147483647) - 1) / 2147483646;
}

function shuffled<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makeBoard(seed: number) {
  const random = seededRandom(seed);
  const spine = SPINES[Math.floor(random() * SPINES.length)];
  const core = spine.ids.map((id) => PANELS.find((panel) => panel.id === id)!).filter(Boolean);
  const rest = shuffled(PANELS.filter((panel) => !spine.ids.includes(panel.id)), random).slice(0, 6);
  return { board: shuffled([...core, ...rest], random), start: spine.start };
}

function codeFor(seed: number) {
  return `MWG-${Math.abs(seed).toString(36).slice(-5).toUpperCase().padStart(5, "0")}`;
}

function freshCode() {
  return codeFor(Date.now() + Math.floor(Math.random() * 9999));
}

function createGame(seed = 407, mode: Mode = "partner"): GameState {
  const { board, start } = makeBoard(seed);
  return {
    board,
    claims: {},
    turn: "O",
    currentChar: start,
    phase: "select",
    selectedIndex: null,
    objections: { O: 3, X: 3 },
    activeCode: codeFor(seed),
    usedCodes: [],
    copied: false,
    proposal: null,
    winner: null,
    winReason: null,
    winningLine: [],
    history: [],
    mode,
    retryBlocked: [],
    rejectedAttempts: [],
    partnerBriefed: mode !== "partner",
    seed,
  };
}

function coordinate(index: number) {
  return `${String.fromCharCode(65 + (index % 4))}${Math.floor(index / 4) + 1}`;
}

function panelVisualDescription(panel: Panel) {
  return panel.visualDescription ?? `${panel.name}として描かれた${panel.category}のイラスト`;
}

function presetReadingsForAi(panel: Panel) {
  return panel.readings.map(presetReadingValue).join("・");
}

function nextPhase(mode: Mode, turn: Player): Phase {
  return mode === "partner" && turn === "X" ? "partner-turn" : "select";
}

function applyMove(state: GameState, proposal: Proposal): GameState {
  const claims = { ...state.claims, [proposal.panelIndex]: proposal.player };
  const result = findWinner(claims);
  const nextTurn: Player = proposal.player === "O" ? "X" : "O";
  const code = freshCode();
  return {
    ...state,
    claims,
    turn: nextTurn,
    currentChar: readingEnd(proposal.reading),
    phase: result.winner ? state.phase : nextPhase(state.mode, nextTurn),
    selectedIndex: null,
    activeCode: code,
    usedCodes: [...state.usedCodes, state.activeCode].slice(-30),
    copied: false,
    proposal: null,
    winner: result.winner,
    winReason: result.winner === "DRAW" ? "draw" : result.winner ? "line" : null,
    winningLine: result.line,
    history: [...state.history, { player: proposal.player, coordinate: coordinate(proposal.panelIndex), reading: proposal.reading }],
    retryBlocked: [],
    rejectedAttempts: [],
  };
}

function applyNEndingLoss(state: GameState, proposal: Proposal): GameState {
  return {
    ...state,
    turn: proposal.player,
    selectedIndex: null,
    copied: false,
    proposal: null,
    winner: winnerAfterNEnding(proposal.player),
    winReason: "n-ending",
    winningLine: [],
    history: [...state.history, { player: proposal.player, coordinate: coordinate(proposal.panelIndex), reading: proposal.reading }],
    retryBlocked: [],
    rejectedAttempts: [],
  };
}

function rejectProposal(state: GameState, judge: Player, spendObjection = true): GameState {
  const proposer = state.proposal?.player ?? state.turn;
  const rejectedIndex = state.proposal?.panelIndex;
  const rejectedReading = state.proposal?.reading;
  const retryPhase = state.mode === "partner" && proposer === "X" ? "partner-turn" : "select";
  const retryBlocked = rejectedIndex === undefined
    ? state.retryBlocked
    : nextRetryBlocks(state.claims, state.retryBlocked, rejectedIndex, state.board.length);
  const rejectedAttempts = rejectedIndex === undefined || !rejectedReading
    ? state.rejectedAttempts
    : [...state.rejectedAttempts, { panelIndex: rejectedIndex, reading: normalizeReading(rejectedReading) }];
  return {
    ...state,
    turn: proposer,
    phase: retryPhase,
    selectedIndex: null,
    objections: spendObjection ? { ...state.objections, [judge]: Math.max(0, state.objections[judge] - 1) } : state.objections,
    activeCode: freshCode(),
    usedCodes: [...state.usedCodes, state.activeCode].slice(-30),
    copied: false,
    proposal: null,
    retryBlocked,
    rejectedAttempts,
  };
}

function parseFields(text: string) {
  const matches = [...text.matchAll(/【([^】]+)】/g)];
  if (!matches.length) return null;
  const fields: Record<string, string> = {};
  matches.at(-1)![1].split(/[｜|]/).forEach((part) => {
    const splitAt = part.search(/[:：]/);
    if (splitAt > 0) fields[part.slice(0, splitAt).trim()] = part.slice(splitAt + 1).trim();
  });
  return fields;
}

function boardSummary(game: GameState) {
  return game.board.map((panel, index) => {
    const owner = game.claims[index];
    if (owner) return `${coordinate(index)}:${owner}取得済み`;
    const blocked = game.retryBlocked.includes(index) ? "｜今回の再試行では選択不可" : "";
    const rejected = game.rejectedAttempts.filter((attempt) => attempt.panelIndex === index).map((attempt) => attempt.reading);
    const rejectedText = rejected.length ? `｜再使用禁止の読み:${rejected.join("・")}` : "";
    return `${coordinate(index)}｜絵文字:${panel.icon}｜ID:${panel.id}｜名前:${panel.name}｜カテゴリ:${panel.category}｜見た目:${panelVisualDescription(panel)}｜正式プリセット読み:${presetReadingsForAi(panel)}${blocked}${rejectedText}`;
  }).join("\n");
}

function lineThreats(claims: Record<number, Player>) {
  const describe = (player: Player) => WIN_LINES.flatMap((line) => {
    const owned = line.filter((index) => claims[index] === player);
    const empty = line.filter((index) => !claims[index]);
    if (owned.length !== 3 || empty.length !== 1) return [];
    return [`${player}が${coordinate(empty[0])}を取ると勝利`];
  });
  const threats = [...describe("O"), ...describe("X")];
  return threats.length ? threats.join("／") : "現在、次の一手で完成するラインはなし";
}

function acceptanceImpact(game: GameState, proposal: Proposal) {
  const claims = { ...game.claims, [proposal.panelIndex]: proposal.player };
  const result = findWinner(claims);
  if (result.winner === proposal.player) return `受理すると${proposal.player}側が勝利する`;
  if (result.winner === "DRAW") return "受理すると、双方ともライン完成不能になり引き分ける";
  const nearWins = WIN_LINES.filter((line) => {
    const owned = line.filter((index) => claims[index] === proposal.player).length;
    const empty = line.filter((index) => !claims[index]).length;
    return owned === 3 && empty === 1;
  }).map((line) => coordinate(line.find((index) => !claims[index])!));
  return nearWins.length ? `受理すると${proposal.player}側がリーチ（次の勝利候補:${nearWins.join("・")}）` : "受理しても直ちにリーチ・勝利にはならない";
}

function partnerIntroPrompt() {
  return `# MIRROR WORD GRID：対戦開始

これから、あなたと一緒に4×4のラインゲームを遊びます。あなたは×側、私は○側です。

## 勝敗条件
- しりとりで空き札を取り、縦・横・斜めのどれか一列を先にそろえた側の勝ち
- 勝つために、自分の列を伸ばす・相手の列を止める一手を戦略的に選んでよい
- 「ん」で終わる読みを宣言した側は、その場で即敗北
- 盤面に空きがあっても、○・×双方とも今後一列を完成できなくなった時点で即時引き分け
- 全マスを使っても一列が完成していない場合も引き分け

## 読みのルール
1. 正式プリセット：作者が正式に認めた読み。絵との細かな一致を再判定せず、そのまま受理してよい
2. 自由読み：絵文字・名前・見た目から追える読み。理由が必要
- 少し強引で創造的な自由読みを、遊び上の通称として「ゴネ読み」と呼ぶことがある。独立した正式カテゴリではない
- 頭文字合わせだけの「お・ご」付与（ねこ→おねこ等）は無効。定着した独立語と正式プリセットは有効
- 語頭の濁音・半濁音は現在の仮設定に従って清音と接続できる
- 「ん」で終わる読みを宣言すると、その手を出した側が即負け。勝つため必ず避ける

## 異議札
- 各側3枚
- 明確な違反は「無効」で、異議札を使わない
- グレーな自由読みや、戦略上止めたい読みには「異議」を使える
- 異議は宣言した読みを拒否するだけで、盤面のマスを永久に消さない

## コピー対戦
- 以後、私がアプリの「この手番をコピー」または「判定依頼をコピー」から盤面と手番コードを渡す
- あなたは各文面に書かれた最終行の形式を守って返す
- 会話や説明は普通の文章で返してよい
- 機械読取用の【手番:…】または【判定:…】の1行だけを、独立したMarkdownコードブロックに入れて最後に付ける
- 会話全体や説明文はコードブロックに入れない。コードブロックの中には機械読取用の1行以外を書かない

この説明を理解したら、まだ一手は選ばず、普段どおりのあなたの言葉で準備できたことを伝えてください。
最後に、機械読取用の【準備:OK】の1行だけを独立したMarkdownコードブロックに入れてください。前後の会話はコードブロックへ入れません。`;
}

function partnerTurnPrompt(game: GameState) {
  const choices = game.board.map((_, index) => index).filter((index) => !game.claims[index] && !game.retryBlocked.includes(index)).map(coordinate).join("、");
  return `# MIRROR WORD GRID：パートナーの手番\n\nあなたは×側です。あなた自身の解釈と性格で、勝つための一手を選んでください。\n\n手番コード：${game.activeCode}\n現在の文字：「${game.currentChar}」\n残り異議札：○ ${game.objections.O}枚／× ${game.objections.X}枚\n選択可能：${choices}\n戦況：${lineThreats(game.claims)}\n\n## 盤面\n${boardSummary(game)}\n\n## 読みの分類\n1. 正式プリセット：作者が正式に認めた読み。見た目との細かな一致を再判定せず、理由なしで必ず受理する\n2. 自由読み：絵文字・名前・見た目から追える読み。理由が必要。少し強引な自由読みを遊び上「ゴネ読み」と呼ぶことはあるが、独立カテゴリではない\n\n## ルール\n- 空きマスを一つ選び、「${game.currentChar}」から始まる読みを宣言する\n- 語頭の濁音・半濁音は清音とつなげてよい（例：か↔が、は↔ば↔ぱ）\n- 「ん」で終わる読みを選ぶと×側の即敗北。候補にあっても必ず避ける\n- 盤面に空きがあっても、双方とも一列を完成できなくなった時点で引き分け\n- 頭文字を合わせる目的だけで、元の語へ「お・ご」などの敬語・美化語・丁寧な接頭語を足した自由読みは無効\n- 「おちゃ」「おかし」「おにぎり」「ごはん」「おうさま」のような定着した独立語と、正式プリセットは使用できる\n- 自由読みには、絵からそう読んだ理由を書く\n- 直前に異議を受けた選択不可マスは選ばない\n- ○のラインを遮断する、自分のラインを伸ばすなど戦況を必ず考える\n- 説明は自由\n\n## 返答形式\n- あなたらしい会話や一手の説明は、普通の文章としてコードブロックの外に書いてよい\n- コピー用の次の1行だけを、独立したMarkdownコードブロックに入れて返答の最後に付ける\n- 会話全体や説明文をコードブロックへ入れない。コードブロック内には次の1行以外を書かない\n\n【手番:A1｜読み:かさ｜理由:傘の絵文字をそのまま読んだ｜コード:${game.activeCode}】`;
}

function partnerJudgePrompt(game: GameState) {
  const proposal = game.proposal!;
  const panel = game.board[proposal.panelIndex];
  const acceptedClaims = { ...game.claims, [proposal.panelIndex]: proposal.player };
  const acceptedResult = findWinner(acceptedClaims);
  const nextChar = readingEnd(proposal.reading);
  const afterAccept = { ...game, claims: acceptedClaims, currentChar: nextChar, retryBlocked: [] };
  const nextChoices = game.board
    .map((_, index) => index)
    .filter((index) => !acceptedClaims[index])
    .map(coordinate)
    .join("、");
  const continuation = acceptedResult.winner
    ? "受理すると試合終了です。受理の行に次手は付けません。"
    : `受理する場合は、続けてあなたの次の一手も同じ最終行で指定してください。\n受理後の文字：「${nextChar}」\n受理後の選択可能：${nextChoices}\n受理後の戦況：${lineThreats(acceptedClaims)}\n\n### 受理後の盤面\n${boardSummary(afterAccept)}`;
  const acceptedFormat = acceptedResult.winner
    ? `【判定:受理｜コード:${game.activeCode}】`
    : `【判定:受理｜次手:A1｜読み:${nextChar}から始まる読み｜理由:その札をそう読んだ理由｜コード:${game.activeCode}】`;

  return `# MIRROR WORD GRID：こじつけ判定＋次の一手\n\nあなたは×側です。○側の自由読みを、納得感と勝ちたい気持ちの両方で裁いてください。読みとして自然でも、通すと相手が有利になるなら異議札を使って止めてかまいません。\n\n手番コード：${game.activeCode}\nマス：${coordinate(proposal.panelIndex)}\n絵文字：${panel.icon}\n札ID：${panel.id}\n名前：${panel.name}\n見た目：${panelVisualDescription(panel)}\n正式プリセット：${presetReadingsForAi(panel)}\n宣言した読み：${proposal.reading}\n理由：${proposal.reason}\n現在の文字：${game.currentChar}\n残り異議札：○ ${game.objections.O}枚／× ${game.objections.X}枚\n戦況：${lineThreats(game.claims)}\nこの手の影響：${acceptanceImpact(game, proposal)}\n\n## 判定の分け方\n1. 明確なルール違反は「無効」。異議札を消費しない\n2. 正式プリセットは、見た目との細かな一致を再判定せず必ず「受理」する\n3. 絵文字・名前・見た目から追える自由読みは「受理」しやすい\n4. 強引さのある自由読み、または戦略上どうしても止めたい手は「異議」。×の異議札を1枚使う\n\n少し強引で創造的な自由読みを遊び上「ゴネ読み」と呼ぶことはあるが、独立した正式カテゴリではない。\n語頭の濁音・半濁音は清音と同じつながりとして扱う（例：か↔が、は↔ば↔ぱ）。\n自由読みは、次の3項目のうち2つ以上を満たすほど受理しやすい：\n- 絵文字に直接見える特徴がある\n- 対象と一般的に強く結びつく特徴・用途・状態である\n- その札を特定できる対象名や固有の要素を含む\n「かわいい」「うまそう」など多くの札に使える主観だけでは弱い。\n頭文字を合わせるためだけに元の語へ「お・ご」などを付けた自由読み（例：ねこ→おねこ）は無効。ただし定着した独立語や正式プリセットは有効。\n\n## 受理する場合\n${continuation}\n\n## 返答形式\n- あなたらしい会話や判定理由は、普通の文章としてコードブロックの外に書いてよい\n- コピー用の最終行だけを、独立したMarkdownコードブロックに入れて返答の最後に付ける\n- 会話全体や説明文をコードブロックへ入れない。コードブロック内には選んだ最終行1つ以外を書かない\n\n${acceptedFormat}\n【判定:無効｜理由:絵文字との関連がほぼない｜コード:${game.activeCode}】\n【判定:異議｜理由:自由読みとして強引、または戦略上ここは取らせたくない｜コード:${game.activeCode}】`;
}

async function copyToClipboard(text: string) {
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("clipboard timeout")), 800)),
    ]);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  }
}

function makeShareCode(game: GameState) {
  const payload = {
    v: 1 as const,
    board: game.board.map((panel) => ({
      id: panel.id,
      icon: panel.icon,
      name: panel.name,
      category: panel.category,
      readings: panel.readings,
      visualDescription: panelVisualDescription(panel),
    })),
    claims: game.board.map((_, index) => game.claims[index] ?? ""),
    currentChar: game.currentChar,
    turn: game.turn,
    objections: [game.objections.O, game.objections.X] as [number, number],
    phase: game.phase,
    winner: game.winner,
    winningLine: game.winningLine,
    retryBlocked: game.retryBlocked,
  };
  return encodeShareState(payload);
}

function MirrorIcon({ small = false }: { small?: boolean }) {
  return (
    <span className={`css-mirror ${small ? "small" : ""}`} aria-hidden="true">
      <i className="css-mirror-glass" />
      <i className="css-mirror-handle" />
    </span>
  );
}

function PanelArtwork({ panel, compact = false }: { panel: Panel; compact?: boolean }) {
  return <span className={`panel-emoji ${compact ? "compact" : ""}`} aria-hidden="true">{panel.icon}</span>;
}

function BearAvatar({ bear, mood = "happy" }: { bear: "shu" | "miu"; mood?: BearMood }) {
  return (
    <span className={`css-bear bear-${bear} mood-${mood}`} aria-label={bear === "shu" ? "しゅ" : "みう"}>
      <i className="bear-ear left" /><i className="bear-ear right" />
      <i className="bear-face"><b className="bear-eye left" /><b className="bear-eye right" /><b className="bear-cheek left" /><b className="bear-cheek right" /><b className="bear-muzzle" /></i>
      <i className="bear-body" />
    </span>
  );
}

function practiceFallbackMood(bear: "shu" | "miu", motion: ShuMotion | MiuMotion): BearMood {
  if (motion === "surprise" || motion === "panic" || motion === "shock") return "surprised";
  if (motion === "cheer" || motion === "ready") return "cheer";
  if (motion === "gone") return "wink";
  if (motion === "reject") return "firm";
  if (motion === "accept") return "wink";
  if (motion === "thinking" || motion === "explain" || motion === "lose") return "thinking";
  return bear === "shu" && motion === "point" ? "happy" : "happy";
}

function PracticeBear({
  bear,
  motion,
}: {
  bear: "shu" | "miu";
  motion: ShuMotion | MiuMotion;
}) {
  const assetKey = `${bear}-${motion}`;
  const stillSrc = PRACTICE_PROVISIONAL_STILLS[assetKey];
  const candidates = [`/practice/${assetKey}.webp`, `/practice/${assetKey}.gif`, stillSrc];
  const [assetState, setAssetState] = useState({ key: assetKey, index: 0 });
  const [loadedAsset, setLoadedAsset] = useState({ key: "", src: "" });
  const assetIndex = assetState.key === assetKey ? assetState.index : 0;
  const assetFailed = assetIndex >= candidates.length;
  const src = candidates[Math.min(assetIndex, candidates.length - 1)];
  const assetReady = loadedAsset.key === assetKey && loadedAsset.src === src;

  return (
    <span
      className={`practice-bear practice-bear-${bear} motion-${motion} ${assetReady ? "asset-ready" : ""} ${assetFailed ? "asset-missing" : ""}`}
      role="img"
      aria-label={`${bear === "shu" ? "しゅ" : "みう"}：${motion}`}
    >
      <Image
        className="practice-bear-art"
        src={src}
        alt=""
        width={512}
        height={512}
        unoptimized
        onLoad={() => setLoadedAsset({ key: assetKey, src })}
        onError={() => setAssetState((current) => ({
          key: assetKey,
          index: current.key === assetKey ? Math.min(current.index + 1, candidates.length) : 1,
        }))}
      />
      <Image
        className="practice-bear-still"
        src={stillSrc}
        alt=""
        width={512}
        height={512}
        unoptimized
      />
      <span className="practice-bear-css" aria-hidden="true">
        <BearAvatar bear={bear} mood={practiceFallbackMood(bear, motion)} />
      </span>
    </span>
  );
}

function NavigatorPair({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`navigator-pair ${compact ? "compact" : ""}`} aria-label="しゅとみうのナビゲーター">
      <BearAvatar bear="shu" />
      <BearAvatar bear="miu" />
    </div>
  );
}

export default function Home() {
  const [game, setGame] = useState<GameState>(() => createGame());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("loading");
  const [pendingMode, setPendingMode] = useState<Mode>("partner");
  const [countdown, setCountdown] = useState(3);
  const [resumeAfterCountdown, setResumeAfterCountdown] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [rejectionFlash, setRejectionFlash] = useState(false);
  const [customReading, setCustomReading] = useState("");
  const [reason, setReason] = useState("");
  const [partnerReply, setPartnerReply] = useState("");
  const [message, setMessage] = useState("絵文字を選んで、しりとりを始めよう！");
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialMessage, setTutorialMessage] = useState("「か」から始まる絵文字を選んでみよう！");
  const [tutorialIntroDone, setTutorialIntroDone] = useState(false);
  const [tutorialWindowOpen, setTutorialWindowOpen] = useState(false);
  const [tutorialChatKind, setTutorialChatKind] = useState<TutorialChatKind>("intro");
  const [tutorialChatPhase, setTutorialChatPhase] = useState<TutorialChatPhase>("empty");
  const [tutorialChatInput, setTutorialChatInput] = useState("");
  const [tutorialGameReply, setTutorialGameReply] = useState("");
  const [tutorialCustomReading, setTutorialCustomReading] = useState("");
  const [tutorialCustomReason, setTutorialCustomReason] = useState("");
  const [tutorialEvent, setTutorialEvent] = useState<TutorialEvent | null>(null);
  const [tutorialMiuAcceptRevealed, setTutorialMiuAcceptRevealed] = useState(false);
  const [tutorialMiuGoneRevealed, setTutorialMiuGoneRevealed] = useState(false);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const restored = JSON.parse(saved) as GameState;
          const board = restored.board.map((savedPanel) => PANELS.find((panel) => panel.id === savedPanel.id) ?? savedPanel);
          const migrated = {
            ...restored,
            board,
            retryBlocked: restored.retryBlocked ?? [],
            rejectedAttempts: restored.rejectedAttempts ?? [],
            partnerBriefed: restored.partnerBriefed ?? true,
            winReason: restored.winReason ?? (restored.winner === "DRAW" ? "draw" : restored.winner ? "line" : null),
            copied: false,
          };
          const hasProgress = migrated.history.length > 0 || Object.keys(migrated.claims).length > 0 || migrated.phase !== "select";
          setGame(migrated);
          setPendingMode(migrated.mode);
          setView(hasProgress && !restored.winner ? "resume" : "title");
        } else {
          setView("title");
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setView("title");
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    if (!hydrated || view !== "game") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  }, [game, hydrated, view]);

  useEffect(() => {
    if (!tutorialWindowOpen || tutorialChatPhase !== "replied") return;
    const frame = window.requestAnimationFrame(() => {
      const log = document.querySelector<HTMLElement>(".tutorial-chat-log");
      if (log) log.scrollTop = log.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tutorialWindowOpen, tutorialChatPhase]);

  useEffect(() => {
    if (!tutorialEvent) return;
    const timer = window.setTimeout(() => setTutorialEvent(null), 1650);
    return () => window.clearTimeout(timer);
  }, [tutorialEvent]);

  useEffect(() => {
    if (view !== "countdown") return;
    if (countdown <= 0) {
      const kickoff = window.setTimeout(() => {
        if (!resumeAfterCountdown) {
          setGame(createGame(Date.now(), pendingMode));
          setCustomReading("");
          setReason("");
          setPartnerReply("");
          setMessage("絵文字を選んで、しりとりを始めよう！");
        }
        setView("game");
      }, 450);
      return () => window.clearTimeout(kickoff);
    }
    const tick = window.setTimeout(() => setCountdown((value) => value - 1), 800);
    return () => window.clearTimeout(tick);
  }, [view, countdown, pendingMode, resumeAfterCountdown]);

  const selectedPanel = game.selectedIndex === null ? null : game.board[game.selectedIndex];
  const registeredOptions = useMemo(() => {
    if (!selectedPanel) return [];
    return availablePresetReadings(selectedPanel, game.currentChar, true);
  }, [selectedPanel, game.currentChar]);

  const prompt = game.phase === "partner-judge" && game.proposal ? partnerJudgePrompt(game) : partnerTurnPrompt(game);
  const isPartnerWaiting = game.phase === "partner-turn" || game.phase === "partner-judge";
  const currentName = game.turn === "O" ? (game.mode === "partner" ? "あなた" : "プレイヤー1") : (game.mode === "partner" ? "パートナー" : "プレイヤー2");
  const tutorialMiuSteps = [2, 3, 4, 7, 10, 11, 12, 15, 16, 17];
  const tutorialMiuIsSpeaking = tutorialMiuSteps.includes(tutorialStep);
  const tutorialChapterIndex = !tutorialIntroDone || tutorialStep < 8 ? 0 : tutorialStep < 16 ? 1 : tutorialStep < 18 ? 2 : 3;
  const tutorialShuMotion: ShuMotion = !tutorialIntroDone
    ? "point"
    : tutorialStep === 8
      ? "gone"
      : tutorialStep === 16 || tutorialStep === 17
        ? "surprise"
        : tutorialStep === 20
          ? "cheer"
          : tutorialStep === 7
            ? "idle"
            : [0, 5, 8, 13, 18].includes(tutorialStep)
              ? "point"
              : "explain";
  const tutorialShuNote = !tutorialIntroDone
    ? "まずは『対戦スタート文』をみうへ渡そう。本番でも、対戦相手のAIへ最初に一度だけルールを送るよ。"
    : TUTORIAL_SHU_NOTES[tutorialStep];
  const tutorialCurrentChar = tutorialStep < 2
    ? "か"
    : tutorialStep < 5
      ? "さ"
      : tutorialStep < 7
        ? "な"
        : tutorialStep < 8
          ? "お"
          : tutorialStep < 16
            ? "ま"
            : tutorialStep < 18
              ? "め"
              : tutorialStep < 20
                ? "る"
                : "—";
  const tutorialObjections = {
    O: tutorialStep >= 17 ? 0 : 1,
    X: tutorialStep >= 13 ? 0 : 1,
  };

  function nameFor(player: Player, mode = game.mode) {
    return player === "O" ? (mode === "partner" ? "あなた" : "プレイヤー1") : (mode === "partner" ? "パートナー" : "プレイヤー2");
  }

  function openNewGameFlow() {
    setPendingMode(game.mode);
    setSummaryOpen(false);
    setView("mode");
  }

  function beginCountdown(resume: boolean) {
    setResumeAfterCountdown(resume);
    setCountdown(3);
    setSummaryOpen(false);
    setView("countdown");
  }

  function openTutorial() {
    setTutorialStep(0);
    setTutorialMessage("最初に、対戦のルールをみうへ渡そう。本番でも最初に一度だけ行う準備だよ。");
    setTutorialIntroDone(false);
    setTutorialWindowOpen(false);
    setTutorialChatKind("intro");
    setTutorialChatPhase("empty");
    setTutorialChatInput("");
    setTutorialGameReply("");
    setTutorialCustomReading("");
    setTutorialCustomReason("");
    setTutorialEvent(null);
    setTutorialMiuAcceptRevealed(false);
    setTutorialMiuGoneRevealed(false);
    setView("tutorial");
  }

  function selectTutorialPanel(id: string) {
    if (!tutorialIntroDone) return;
    const targets: Record<number, string> = {
      0: "umbrella",
      5: "crying-face",
      8: "top",
      13: "glasses",
      18: "top",
    };
    const target = targets[tutorialStep];
    if (!target) return;
    if (id !== target) {
      const messages: Record<number, string> = {
        0: "いまは『か』から。しゅがミント色に光らせている☔を探してみよう！",
        5: "いまは『な』から。光っている😭なら『なきがお』でつながるよ。",
        8: "いまは『ま』から。光っている♾️で自由読みを試そう。",
        13: "文字はまだ『ま』のまま。光っている👓を見てみよう。",
        18: "✉️『メール』の次は『る』。上段中央で光っている♾️が勝ち札だよ。",
      };
      setTutorialMessage(messages[tutorialStep]);
      return;
    }
    if (tutorialStep === 0) {
      setTutorialStep(1);
      setTutorialMessage("☔には正式プリセットの『かさ』があるよ。正式読みは見た目を再審査せず使える！");
    } else if (tutorialStep === 5) {
      setTutorialStep(6);
      setTutorialMessage("😭には正式プリセットの『なきがお』があるよ。これで次の文字を『お』へつなげよう。");
    } else if (tutorialStep === 8) {
      setTutorialStep(9);
      setTutorialCustomReading("まるまる");
      setTutorialCustomReason("まるが2つあるから！");
      setTutorialMessage("今度は自分でゴネる番！ 今回はお手本として、しゅが読みと理由を入力しておいたよ。内容を見て宣言しよう！");
    } else if (tutorialStep === 13) {
      setTutorialStep(14);
      setTutorialCustomReading("まじめ");
      setTutorialCustomReason("メガネをかけると真面目そうに見えるから");
      setTutorialMessage("もう一度ゴネよう。今回もしゅがお手本を入力しておいたよ。みうの異議札は0枚だから、ゴネ切れば通る！");
    } else if (tutorialStep === 18) {
      setTutorialStep(19);
      setTutorialMessage("♾️には正式プリセット『ループ』があるよ。☔・♾️・👓の上段を完成させよう！");
    }
  }

  async function copyTutorialPrompt(kind: TutorialChatKind) {
    const text = TUTORIAL_CHAT[kind].prompt;
    const copied = await copyToClipboard(text);
    if (!copied) {
      setTutorialMessage("コピーできなかったよ。もう一度押してね。");
      return;
    }
    setTutorialChatKind(kind);
    setTutorialChatPhase("empty");
    setTutorialChatInput("");
    setTutorialGameReply("");
    setTutorialWindowOpen(true);
    if (kind === "turn") setTutorialStep(3);
    if (kind === "judge") setTutorialStep(11);
    setTutorialMessage("コピーできた！ 開いた練習用AI窓へ貼り付けて、みうに送ってみよう。");
  }

  function openTutorialWindow() {
    setTutorialWindowOpen(true);
  }

  function pasteTutorialPrompt() {
    setTutorialChatInput(TUTORIAL_CHAT[tutorialChatKind].prompt);
    setTutorialChatPhase("pasted");
  }

  function sendTutorialPrompt() {
    if (!tutorialChatInput.trim()) return;
    setTutorialChatPhase("replied");
  }

  async function copyTutorialReply() {
    if (tutorialChatKind === "intro") {
      setTutorialIntroDone(true);
      setTutorialWindowOpen(false);
      setTutorialChatPhase("empty");
      setTutorialChatInput("");
      setTutorialMessage("みうの『準備OK』を確認できたね！ 盤面から『か』で始まる☔を選ぼう。");
      return;
    }
    const copied = await copyToClipboard(TUTORIAL_CHAT[tutorialChatKind].reply);
    if (!copied) {
      setTutorialMessage("返答をコピーできなかったよ。もう一度押してね。");
      return;
    }
    setTutorialStep(tutorialChatKind === "turn" ? 4 : 12);
    setTutorialWindowOpen(false);
    setTutorialGameReply("");
    setTutorialMessage("返答をコピーしたよ。今度はゲーム側の回答欄へ貼り付けよう！");
  }

  function pasteTutorialReply() {
    setTutorialGameReply(TUTORIAL_CHAT[tutorialChatKind].reply);
  }

  function submitTutorialCustomReading(kind: "marumaru" | "majime") {
    const expected = kind === "marumaru" ? "まるまる" : "まじめ";
    const expectedReason = kind === "marumaru" ? "まるが2つあるから！" : "メガネをかけると真面目そうに見えるから";
    if (normalizeReading(tutorialCustomReading) !== normalizeReading(expected)) {
      setTutorialMessage(`今回は読みへ「${expected}」と入れてみよう。本番では、自分で思いついた読みを自由に試してね。`);
      return;
    }
    if (normalizeReading(tutorialCustomReason) !== normalizeReading(expectedReason)) {
      setTutorialMessage(`今回は理由へ「${expectedReason}」と入れてみよう。本番では、自分の発想で自由にこじつけてOK！`);
      return;
    }
    if (kind === "marumaru") {
      setTutorialStep(10);
      setTutorialMessage("自分で『まるまる』とゴネられた！ 次は、この読みをみうへ渡して判定してもらおう。");
    } else {
      setTutorialStep(15);
      setTutorialMiuAcceptRevealed(false);
      setTutorialMessage("『まじめ』を自分で宣言できた！ みうが悩んでる……判定を聞いてみよう。");
    }
  }

  function applyTutorialReply() {
    if (!tutorialGameReply.trim()) {
      setTutorialMessage("先に、コピーした返答を回答欄へ貼り付けてね。");
      return;
    }
    advanceTutorial();
  }

  function advanceTutorial() {
    if (tutorialStep === 1) {
      setTutorialStep(2);
      setTutorialMessage("「かさ」でA1をGET！ 最後の「さ」で、次はAI代理みうの手番だよ。");
    } else if (tutorialStep === 4) {
      setTutorialStep(5);
      setTutorialMessage("返答を反映して、みうがB3の🐟をGET。次は『な』から、しゅ＋プレイヤーの手番！");
    } else if (tutorialStep === 6) {
      setTutorialStep(7);
      setTutorialMessage("😭『なきがお』でA2をGET！ 次は『お』から、みうが🌙を『おつきさま』で取るよ。");
    } else if (tutorialStep === 7) {
      setTutorialStep(8);
      setTutorialEvent("gone");
      setTutorialMessage("……さて。ここまでは、ふつうのしりとり。でもMIRROR WORD GRIDは――ここからが本番！");
    } else if (tutorialStep === 12) {
      setTutorialStep(13);
      setTutorialMessage("却下されても失敗じゃないよ！ 『それは無理！』『いや通るでしょ！』ってやり合うのも遊び。じゃあ、もう一回いこう！");
    } else if (tutorialStep === 15) {
      setTutorialStep(16);
      setTutorialMiuGoneRevealed(false);
      setTutorialMessage("『まじめ』が通って👓をGET！ ……あ、リーチだ！ みうも焦ってる！");
    } else if (tutorialStep === 16) {
      setTutorialStep(17);
      setTutorialEvent("objection");
      setTutorialMessage("異議あり！ 🎄『メリークリスマス』を却下。みうは同じ『め』から別の手を探すよ。");
    } else if (tutorialStep === 17) {
      setTutorialStep(18);
      setTutorialMessage("みうが✉️を正式プリセット『メール』でGET。次は『る』。上段を完成できる札を探そう！");
    } else if (tutorialStep === 19) {
      setTutorialStep(20);
      setTutorialEvent("victory");
      setTutorialMessage("♾️を『ループ』でGET！ ☔・♾️・👓の上段3マスがそろって模擬戦勝利！");
    }
  }

  function flashRejection(text: string) {
    setMessage(text);
    setRejectionFlash(true);
    window.setTimeout(() => setRejectionFlash(false), 900);
  }

  function selectPanel(index: number) {
    if (game.winner || !game.partnerBriefed || game.phase !== "select" || game.claims[index] || game.retryBlocked.includes(index)) return;
    setGame({ ...game, selectedIndex: index, phase: "reading" });
    setCustomReading("");
    setReason("");
    setMessage(`${coordinate(index)}「${game.board[index].name}」をどう読む？`);
  }

  function submitReading(reading: string, explanation: string) {
    if (game.selectedIndex === null || !selectedPanel) return;
    const normalized = normalizeReading(reading);
    if (normalized.length < 2) return setMessage("読みは2文字以上で入れてね。");
    if (!readingStartsWith(reading, game.currentChar)) return setMessage(`「${game.currentChar}」から始まる読みだけ使えるよ。濁音・半濁音は清音とつないでOK！`);
    const registered = isRegistered(selectedPanel, reading);
    if (isRepeatedRejectedReading(game.rejectedAttempts, game.selectedIndex, reading)) return setMessage("そのマスで、その読みは直前に異議・無効になっているよ。別の読みを考えてね。");
    if (!registered && hasArtificialPolitePrefix(selectedPanel, reading)) return setMessage("頭文字を合わせるためだけの『お・ご』付けは使えないよ。別の読みを考えてね。");
    if (!registered && !explanation.trim()) return setMessage("自由読みには、絵文字からそう読んだ理由も必要だよ。");

    const proposal: Proposal = {
      player: game.turn,
      panelIndex: game.selectedIndex,
      reading: reading.trim(),
      reason: registered ? "正式プリセット" : explanation.trim(),
      custom: !registered,
    };

    if (readingEnd(reading) === "ん") {
      setGame(applyNEndingLoss(game, proposal));
      setMessage(`「${proposal.reading}」は『ん』で終了。${nameFor(proposal.player)}側の負け！`);
      return;
    }

    if (registered) {
      const nextGame = applyMove(game, proposal);
      setGame(nextGame);
      setMessage(`「${proposal.reading}」で${coordinate(proposal.panelIndex)}を取得！ 次は「${readingEnd(proposal.reading)}」。`);
    } else if (game.mode === "partner") {
      setGame({ ...game, proposal, phase: "partner-judge", selectedIndex: null, copied: false });
      setMessage("自由読みだね。手番コードをコピーして、パートナーへ判定を渡そう。");
    } else {
      setGame({ ...game, proposal, phase: "local-judge", selectedIndex: null });
      setMessage("相手は、このこじつけを受理する？");
    }
  }

  function cancelReading() {
    setGame({ ...game, selectedIndex: null, phase: "select" });
    setMessage("別の絵文字を選び直せるよ。");
  }

  async function copyPrompt() {
    const copied = await copyToClipboard(prompt);
    if (!copied) return setMessage("コピーできなかったよ。文章を長押ししてコピーしてね。");
    setGame({ ...game, copied: true });
    setMessage("パートナーの回答待ち。戻ってきたら、下の大きな欄へ回答を貼ってね。");
  }

  async function copyPartnerIntro() {
    const copied = await copyToClipboard(partnerIntroPrompt());
    if (!copied) return setMessage("コピーできなかったよ。もう一度ボタンを押してね。");
    setGame({
      ...game,
      partnerBriefed: true,
      copied: false,
    });
    setMessage("対戦開始文をコピーしたよ。パートナーへ貼ったら、盤面から最初の札を選んでね！");
  }

  async function copyBoardLink() {
    const link = `${window.location.origin}/share?state=${makeShareCode(game)}`;
    const copied = await copyToClipboard(link);
    setMessage(copied ? "閲覧専用の盤面リンクをコピーしたよ。" : "盤面リンクをコピーできなかったよ。もう一度試してね。");
  }

  function resolvePartnerMove(baseGame: GameState, fields: Record<string, string>, combined = false) {
    const coord = (combined ? fields["次手"] : fields["手番"])?.toUpperCase();
    const match = coord?.match(/^([A-D])([1-4])$/);
    const retryPartnerTurn = (text: string) => {
      if (combined) {
        setGame(baseGame);
        setPartnerReply("");
        setMessage(`こじつけの受理は反映したよ。${text} 次の手番コードをコピーして、パートナーの一手だけ受け取ろう。`);
        return;
      }
      setGame({
        ...baseGame,
        activeCode: freshCode(),
        usedCodes: [...baseGame.usedCodes, baseGame.activeCode].slice(-30),
        copied: false,
      });
      setPartnerReply("");
      setMessage(`${text} 異議札は減りません。「手番コードをコピー」をもう一度押してね。`);
    };

    if (!match) return retryPartnerTurn(combined ? "次手をA1〜D4の形式で読み取れませんでした。" : "手番はA1〜D4の形式で返してもらってね。");
    const index = (Number(match[2]) - 1) * 4 + (match[1].charCodeAt(0) - 65);
    if (baseGame.claims[index]) return retryPartnerTurn(`${coord}はもう取得済みです。`);
    if (baseGame.retryBlocked.includes(index)) return retryPartnerTurn(`${coord}は直前に異議を受けたため、今回の再試行では選べません。`);
    const reading = fields["読み"] ?? "";
    if (!readingStartsWith(reading, baseGame.currentChar)) return retryPartnerTurn(`今は「${baseGame.currentChar}」から始める手番です。濁音・半濁音は清音とつなげられます。`);
    const custom = !isRegistered(baseGame.board[index], reading);
    const proposal: Proposal = { player: "X", panelIndex: index, reading, reason: fields["理由"] ?? "", custom };
    if (readingEnd(reading) === "ん") {
      setGame(applyNEndingLoss(baseGame, proposal));
      setPartnerReply("");
      setMessage(`パートナーが「${reading}」を宣言。『ん』で終わったため、○側の勝ち！`);
      return;
    }
    if (isRepeatedRejectedReading(baseGame.rejectedAttempts, index, reading)) return retryPartnerTurn(`${coord}で同じ読みは直前に異議・無効になっています。別の読みを使ってください。`);
    if (custom && hasArtificialPolitePrefix(baseGame.board[index], reading)) return retryPartnerTurn("頭文字を合わせるためだけの『お・ご』付けは無効です。");
    if (custom && !proposal.reason) return retryPartnerTurn("自由読みなのに理由がありません。");

    if (custom) {
      setGame({ ...baseGame, proposal, phase: "player-judge", copied: false });
      setMessage(combined
        ? "受理と次の一手をまとめて反映！ パートナーの自由読みを、あなたが判定する番だよ。"
        : "パートナーの自由読み。あなたが受理するか決める番だよ。");
    } else {
      const nextGame = applyMove(baseGame, proposal);
      setGame(nextGame);
      setMessage(`パートナーが「${reading}」で${coord}を取得。次の手番を確認してね。`);
    }
    setPartnerReply("");
  }

  function parsePartnerReply() {
    const fields = parseFields(partnerReply);
    if (!fields) return setMessage("【 】で囲まれた最終行を見つけられなかったよ。");
    if (fields["コード"] !== game.activeCode) return setMessage("手番コードが違うよ。古い返答かもしれない。");
    if (game.usedCodes.includes(fields["コード"])) return setMessage("この手番コードは、もう使われているよ。");

    if (game.phase === "partner-judge") {
      if (!game.proposal) return setMessage("判定する宣言が見つからないよ。");
      if (fields["判定"] === "受理") {
        const proposal = game.proposal;
        const nextGame = applyMove(game, proposal);
        if (!nextGame.winner && fields["次手"]) {
          resolvePartnerMove(nextGame, fields, true);
        } else {
          setGame(nextGame);
          setMessage(`パートナーが受理！ 「${proposal.reading}」で取得したよ。次の手番を確認してね。`);
        }
      } else if (fields["判定"] === "無効") {
        const nextGame = rejectProposal(game, "X", false);
        setGame(nextGame);
        flashRejection(`ルール違反で無効。異議札は減りません。理由：${fields["理由"] || "絵文字との関連が確認できない"}`);
      } else if (fields["判定"] === "異議") {
        if (game.objections.X <= 0) {
          const proposal = game.proposal;
          const nextGame = applyMove(game, proposal);
          setGame(nextGame);
          setMessage("パートナーの異議札はゼロ。グレー判定のため、今回は自動で受理したよ。");
        } else {
          const nextGame = rejectProposal(game, "X");
          setGame(nextGame);
          flashRejection(`異議成立。理由：${fields["理由"] || "今回は通さないと判断"}`);
        }
      } else return setMessage("判定は「受理」「無効」「異議」のどれかで返してもらってね。");
      setPartnerReply("");
      return;
    }

    if (game.phase !== "partner-turn") return setMessage("今はパートナーの手番ではないよ。");
    resolvePartnerMove(game, fields);
  }

  function judgeLocal(accepted: boolean) {
    if (!game.proposal) return;
    const judge: Player = game.proposal.player === "O" ? "X" : "O";
    if (accepted) {
      const proposal = game.proposal;
      const nextGame = applyMove(game, proposal);
      setGame(nextGame);
      setMessage(`受理！ 「${proposal.reading}」で取得したよ。次の手番を確認してね。`);
    } else {
      if (game.objections[judge] <= 0) {
        const proposal = game.proposal;
        const nextGame = applyMove(game, proposal);
        setGame(nextGame);
        setMessage("異議札が残っていないため、グレー判定は自動で受理したよ。");
        return;
      }
      const nextGame = rejectProposal(game, judge);
      setGame(nextGame);
      flashRejection("異議成立。同じマス・同じ読みの連打はできないよ。別の合法手でやり直そう。");
    }
  }

  function invalidateLocalProposal() {
    if (!game.proposal) return;
    const judge: Player = game.proposal.player === "O" ? "X" : "O";
    const nextGame = rejectProposal(game, judge, false);
    setGame(nextGame);
    flashRejection("明確なルール違反として無効。異議札は減りません。");
  }

  const brand = (
    <div className="start-brand">
      <Image className="start-brand-image" src="/mirror-word-grid-logo.png" alt="MIRROR WORD GRID — AI PARTNER × WORD GAME" width={835} height={483} priority unoptimized />
    </div>
  );

  if (view !== "game") {
    return (
      <main className="start-shell">
        <section className={`start-card view-${view}`}>
          {view !== "title" && view !== "loading" && brand}

          {view === "loading" && <><div className="loading-logo">{brand}</div><div className="loading-dots" aria-label="読み込み中"><i /><i /><i /></div></>}

          {view === "title" && (
            <div className="start-content title-content title-hero">
              <div className="title-logo-stage">{brand}</div>
              <div className="title-copy">
                <div className="navigator-stage">
                  <div className="welcome-bubble">MIRROR WORD GRIDへ<br /><strong>ようこそーっ!!</strong></div>
                  <NavigatorPair />
                </div>
                <p className="start-kicker">ILLUSTRATION SHIRITORI × LINE GAME</p>
                <h2>絵の読み方は、<br /><span>ひとつじゃない。</span></h2>
                <p>絵からことばを見つけて、しりとりで陣地をつなごう。先に一列そろえた側の勝ち！</p>
                <div className="title-actions">
                  <button className="start-button title-start-button" type="button" onClick={() => setView("mode")}><span>ゲームをはじめる</span><b>→</b></button>
                  <button className="tutorial-button" type="button" onClick={openTutorial}><span>🧸</span> しゅ＆みうと練習する</button>
                  <button className="text-button" type="button" onClick={() => setView("guide")}>詳しいルールを読む</button>
                </div>
              </div>
            </div>
          )}

          {view === "tutorial" && (
            <div className="tutorial-view">
              <header className="guide-heading tutorial-heading">
                <div className="tutorial-heading-title"><p className="step-label">SHU + PLAYER VS AI MIU</p><h2>しゅ＆みうの模擬戦！</h2></div>
                <div className="guide-heading-tools"><NavigatorPair compact /><button className="back-button" type="button" onClick={() => setView("title")}>← 戻る</button></div>
              </header>

              <nav className="tutorial-chapters" aria-label="模擬戦の進行">
                {TUTORIAL_CHAPTERS.map((chapter, index) => (
                  <span key={chapter} className={index === tutorialChapterIndex ? "current" : index < tutorialChapterIndex ? "done" : ""}>
                    <i aria-hidden="true">{index < tutorialChapterIndex ? "✓" : index + 1}</i>{chapter}
                  </span>
                ))}
              </nav>

              {tutorialEvent && (
                <div className={`tutorial-event tutorial-event-${tutorialEvent}`} role="status" aria-live="assertive">
                  <span>{tutorialEvent === "gone" ? "✨ ゴネ解禁！ ✨" : tutorialEvent === "objection" ? "異議あり！ ×" : "3枚そろったーー！！🎉"}</span>
                </div>
              )}

              <div className="tutorial-layout">
                <section className="tutorial-game" aria-label="3×3の模擬戦盤面">
                  <div className="tutorial-status">
                    <div><small>いまの文字</small><strong>{tutorialIntroDone ? tutorialCurrentChar : "—"}</strong></div>
                    <div><small>いまの担当</small><strong>{tutorialMiuIsSpeaking ? "AI代理みう" : "しゅ＋プレイヤー"}</strong></div>
                    <div><small>勝利条件</small><strong>3枚を一列</strong></div>
                    <div><small>異議札</small><strong>○ {tutorialObjections.O} / × {tutorialObjections.X}</strong></div>
                  </div>
                  <div className={`tutorial-board ${tutorialIntroDone ? "" : "waiting-intro"} ${tutorialStep >= 20 ? "victory" : ""}`}>
                    {TUTORIAL_PANELS.map((panel, index) => {
                      const targetByStep: Record<number, string> = { 0: "umbrella", 5: "crying-face", 8: "top", 13: "glasses", 18: "top" };
                      const claimedByYou = (panel.id === "umbrella" && tutorialStep >= 2)
                        || (panel.id === "crying-face" && tutorialStep >= 7)
                        || (panel.id === "glasses" && tutorialStep >= 16)
                        || (panel.id === "top" && tutorialStep >= 20);
                      const claimedByMiu = (panel.id === "flying-fish" && tutorialStep >= 5)
                        || (panel.id === "moon" && tutorialStep >= 8)
                        || (panel.id === "mail" && tutorialStep >= 18);
                      const selected = (panel.id === "umbrella" && tutorialStep === 1)
                        || (panel.id === "crying-face" && tutorialStep === 6)
                        || (panel.id === "moon" && tutorialStep === 7)
                        || (panel.id === "top" && tutorialStep >= 9 && tutorialStep <= 12)
                        || (panel.id === "glasses" && tutorialStep === 14)
                        || (panel.id === "christmas-tree" && tutorialStep === 16)
                        || (panel.id === "mail" && tutorialStep === 17)
                        || (panel.id === "top" && tutorialStep === 19);
                      const rejectedReading = panel.id === "top" && tutorialStep >= 13 && tutorialStep < 18;
                      const blocked = panel.id === "christmas-tree" && tutorialStep >= 17;
                      const lineTarget = tutorialStep >= 18 && [0, 1, 2].includes(index);
                      const hinted = tutorialIntroDone && targetByStep[tutorialStep] === panel.id;
                      const canSelect = tutorialIntroDone && Object.hasOwn(targetByStep, tutorialStep) && !claimedByYou && !claimedByMiu && !blocked;
                      return (
                        <button
                          key={panel.id}
                          type="button"
                          className={`tutorial-tile ${selected ? "selected" : ""} ${hinted ? "hint" : ""} ${claimedByYou ? "claimed-o" : ""} ${claimedByMiu ? "claimed-x" : ""} ${blocked ? "retry-blocked" : ""} ${lineTarget ? "line-target" : ""}`}
                          onClick={() => selectTutorialPanel(panel.id)}
                          disabled={!canSelect}
                          aria-label={`${String.fromCharCode(65 + (index % 3))}${Math.floor(index / 3) + 1} ${panel.name}${blocked ? " 異議で却下" : ""}`}
                        >
                          <span className="tutorial-coordinate">{String.fromCharCode(65 + (index % 3))}{Math.floor(index / 3) + 1}</span>
                          <span aria-hidden="true">{panel.icon}</span>
                          <small>{panel.name}</small>
                          {(claimedByYou || claimedByMiu) && <i className={`tutorial-claim ${claimedByYou ? "side-o" : "side-x"}`} />}
                          {(blocked || rejectedReading) && <b className="tutorial-block">{blocked ? "異議" : "まるまる×"}</b>}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <aside className="tutorial-coach">
                  <div className="tutorial-coach-guide" aria-live="polite">
                    <PracticeBear bear="shu" motion={tutorialShuMotion} />
                    <div className="tutorial-speech">
                      <span className="guide-tag">現在：{TUTORIAL_CHAPTERS[tutorialChapterIndex]}</span>
                      <h3>{tutorialIntroDone ? TUTORIAL_TITLES[tutorialStep] : "みうにルールを渡そう"}</h3>
                      <p>{tutorialShuNote}</p>
                    </div>
                  </div>
                  <div className="tutorial-coach-actions">
                    <p className="tutorial-message" aria-live="polite">{tutorialMessage}</p>

                  {!tutorialIntroDone && <button className="start-button tutorial-next-action" type="button" onClick={() => copyTutorialPrompt("intro")}>⧉ 対戦スタート文をコピー <b>→</b></button>}
                  {tutorialStep === 1 && <button className="start-button tutorial-next-action" type="button" onClick={advanceTutorial}>正式読み「かさ」を使う <b>→</b></button>}
                  {tutorialStep === 2 && (
                    <div className="tutorial-copy-step">
                      <pre>現在文字：さ{"\n"}AI代理みうは×側{"\n"}返答：【手番:B3｜読み:さかな】</pre>
                      <button className="start-button tutorial-next-action" type="button" onClick={() => copyTutorialPrompt("turn")}>⧉ この手番をコピー</button>
                    </div>
                  )}
                  {tutorialIntroDone && (tutorialStep === 3 || tutorialStep === 11) && (
                    <button className="start-button bears-turn-button tutorial-next-action" type="button" onClick={openTutorialWindow}>💬 練習用AI窓を開く <b>→</b></button>
                  )}
                  {(tutorialStep === 4 || tutorialStep === 12) && (
                    <div className="tutorial-return-step">
                      <label><span>ここにAIパートナーの返答を貼り付ける</span><textarea rows={2} value={tutorialGameReply} onChange={(event) => setTutorialGameReply(event.target.value)} placeholder="コピーした【手番:…】または【判定:…】を貼り付けてね" /></label>
                      <button className={`tutorial-paste-button ${tutorialGameReply.trim() ? "" : "tutorial-next-action"}`} type="button" onClick={pasteTutorialReply}>⧉ コピーした返答を貼り付ける</button>
                      <button className={`start-button ${tutorialGameReply.trim() ? "tutorial-next-action" : ""}`} type="button" disabled={!tutorialGameReply.trim()} onClick={applyTutorialReply}>{tutorialStep === 4 ? "返答を盤面へ反映" : "みうの異議を反映"} <b>→</b></button>
                    </div>
                  )}
                  {tutorialStep === 6 && <button className="start-button tutorial-next-action" type="button" onClick={advanceTutorial}>正式読み「なきがお」を使う <b>→</b></button>}
                  {tutorialStep === 7 && (
                    <div className="tutorial-miu-proposal">
                      <PracticeBear bear="miu" motion="idle" />
                      <div className="tutorial-miu-copy"><b>みう</b><p>「『お』なら……おつきさま！🌙」</p></div>
                      <button className="start-button bears-turn-button tutorial-next-action" type="button" onClick={advanceTutorial}>みうの「おつきさま」を反映 <b>→</b></button>
                    </div>
                  )}
                  {tutorialIntroDone && (tutorialStep === 9 || tutorialStep === 14) && (
                    <form className="tutorial-gone-form" onSubmit={(event) => { event.preventDefault(); submitTutorialCustomReading(tutorialStep === 9 ? "marumaru" : "majime"); }}>
                      <label className={!tutorialCustomReading.trim() ? "tutorial-next-action" : ""}><span>自由読み</span><input value={tutorialCustomReading} onChange={(event) => setTutorialCustomReading(event.target.value)} placeholder={tutorialStep === 9 ? "まるまる" : "まじめ"} /></label>
                      <label className={tutorialCustomReading.trim() && !tutorialCustomReason.trim() ? "tutorial-next-action" : ""}><span>こじつけた理由</span><textarea rows={2} value={tutorialCustomReason} onChange={(event) => setTutorialCustomReason(event.target.value)} placeholder={tutorialStep === 9 ? "まるが2つあるから！" : "メガネをかけると真面目そうに見えるから"} /></label>
                      <small><strong>しゅのお手本：</strong>今回は読みと理由を入力済み。内容を読んで、そのまま宣言してみよう！</small>
                      <button className={`start-button ${tutorialCustomReading.trim() && tutorialCustomReason.trim() ? "tutorial-next-action" : ""}`} type="submit">この自由読みで宣言する <b>→</b></button>
                    </form>
                  )}
                  {tutorialStep === 10 && (
                    <div className="tutorial-copy-step">
                      <pre>宣言：B1 ♾️を「まるまる」{"\n"}理由：まるが2つあるから！{"\n"}AI代理みうが判定</pre>
                      <button className="start-button tutorial-next-action" type="button" onClick={() => copyTutorialPrompt("judge")}>⧉ 判定依頼をコピー</button>
                    </div>
                  )}
                  {tutorialStep === 15 && (
                    <div className="tutorial-miu-proposal tutorial-gone-result">
                      <PracticeBear bear="miu" motion={tutorialMiuAcceptRevealed ? "accept" : "thinking"} />
                      <div className="tutorial-miu-copy"><b>みう <span>異議札 0枚</span></b>
                        <p>{tutorialMiuAcceptRevealed ? "むむ……！ それなら分かる。今回は受理！" : "むむ……『まじめ』……？"}</p>
                        <small>{tutorialMiuAcceptRevealed ? "異議札ももう0枚。理由をつけたゴネが通った！" : "みうが読みと理由を考えているよ。"}</small>
                      </div>
                      {tutorialMiuAcceptRevealed
                        ? <button className="start-button tutorial-next-action" type="button" onClick={advanceTutorial}>ゴネを通して👓をGET <b>→</b></button>
                        : <button className="secondary-start tutorial-next-action" type="button" onClick={() => { setTutorialMiuAcceptRevealed(true); setTutorialMessage("みうが納得して『まじめ』を受理！ 今度は、自分でゴネを通す瞬間だよ！"); }}>みうの判定を聞く <b>→</b></button>}
                    </div>
                  )}
                  {tutorialStep === 16 && (
                    <div className="tutorial-miu-proposal">
                      <PracticeBear bear="miu" motion={tutorialMiuGoneRevealed ? "gone" : "panic"} />
                      <div className="tutorial-miu-copy"><b>みう <span>{tutorialMiuGoneRevealed ? "自由読み（ゴネ）" : "リーチに気づいた！"}</span></b>
                        <p>{tutorialMiuGoneRevealed ? "じゃあ……これっ！ 『メリークリスマス！』🎄" : "えっ、そろっちゃう！？"}</p>
                        <small>{tutorialMiuGoneRevealed ? "理由：クリスマスツリーだから『メリークリスマス』！ ○側がリーチだから、先に勝ちにいく！" : "○側のリーチを見て焦ってる！ AIパートナー側も、同じルールで先に勝ちにくるよ。"}</small>
                      </div>
                      {tutorialMiuGoneRevealed
                        ? <button className="start-button tutorial-next-action" type="button" onClick={advanceTutorial}>異議札で🎄を却下する <b>→</b></button>
                        : <button className="secondary-start tutorial-next-action" type="button" onClick={() => { setTutorialMiuGoneRevealed(true); setTutorialMessage("みうもゴネてきた！ 『メリークリスマス』を通したくないなら、異議札の出番！"); }}>みうの手を見る <b>→</b></button>}
                    </div>
                  )}
                  {tutorialStep === 17 && (
                    <div className="tutorial-miu-proposal tutorial-objection-result">
                      <PracticeBear bear="miu" motion="shock" />
                      <div className="tutorial-miu-copy"><b>みう</b><p>「ええーーっ！？🥺」</p><small>むむむ……じゃあ、✉️を正式読み「メール」！</small></div>
                      <button className="start-button bears-turn-button tutorial-next-action" type="button" onClick={advanceTutorial}>みうの「メール」を反映 <b>→</b></button>
                    </div>
                  )}
                  {tutorialStep === 19 && <button className="start-button tutorial-next-action" type="button" onClick={advanceTutorial}>正式読み「ループ」で取る <b>→</b></button>}
                  {tutorialStep === 20 && (
                    <div className="tutorial-finish-actions">
                      <div className="tutorial-miu-proposal tutorial-lose-card">
                        <PracticeBear bear="miu" motion="lose" />
                        <div className="tutorial-miu-copy"><b>みう</b><p>「負けたーー！ でも、いいゴネだった！」</p><small>本番では、もっと変な読み持ってきてね！</small></div>
                      </div>
                      <p className="tutorial-ending-copy"><strong>これで準備OK！</strong> 絵は一つでも、読み方はたくさん。相手とゴネ合いながらラインを作ろう！</p>
                      <button className="start-button tutorial-next-action" type="button" onClick={() => setView("mode")}>AIパートナーを連れて、本番へ！ <b>→</b></button>
                      <button className="secondary-start" type="button" onClick={openTutorial}>もう一度練習</button>
                      <button className="text-button" type="button" onClick={() => setView("title")}>タイトルへ戻る</button>
                    </div>
                  )}
                  </div>
                </aside>
              </div>

              {tutorialWindowOpen && (
                <div className="tutorial-window-layer" role="dialog" aria-modal="true" aria-label="練習用AIチャット">
                  <button className="tutorial-window-scrim" type="button" aria-label="別窓を閉じる" onClick={() => setTutorialWindowOpen(false)} />
                  <section className="tutorial-window">
                    <header>
                      <div><small>PRACTICE WINDOW</small><strong>コピー往復を練習</strong></div>
                      <button type="button" onClick={() => setTutorialWindowOpen(false)} aria-label="別窓を閉じる">×</button>
                    </header>
                    <div className="tutorial-chat-pane">
                        <div className="tutorial-chat-heading">
                          <PracticeBear
                            bear="miu"
                            motion={tutorialChatPhase === "replied" ? (tutorialChatKind === "intro" ? "ready" : tutorialChatKind === "judge" ? "reject" : "ready") : tutorialChatPhase === "pasted" ? "thinking" : "idle"}
                          />
                          <div><strong>AI代理みう</strong><small>ここは、いつものAIとの会話の練習窓だよ</small></div>
                        </div>
                        <div className="tutorial-chat-log" aria-live="polite">
                          {tutorialChatInput ? <div className="tutorial-chat-bubble user"><small>あなた</small><pre>{tutorialChatInput}</pre></div> : <p>コピーした文章を下の欄へ貼り付けてね。</p>}
                          {tutorialChatPhase === "replied" && <div className="tutorial-chat-bubble miu"><small>みう</small><p>{TUTORIAL_CHAT[tutorialChatKind].replyLabel}</p><code>{TUTORIAL_CHAT[tutorialChatKind].reply}</code></div>}
                        </div>
                        {tutorialChatPhase !== "replied" ? (
                          <div className="tutorial-chat-compose">
                            <label><span>メッセージ</span><textarea rows={2} value={tutorialChatInput} onChange={(event) => { setTutorialChatInput(event.target.value); setTutorialChatPhase(event.target.value.trim() ? "pasted" : "empty"); }} placeholder="ここへコピーした手番を貼り付ける" /></label>
                            <button className={`tutorial-paste-button ${tutorialChatInput.trim() ? "" : "tutorial-next-action"}`} type="button" onClick={pasteTutorialPrompt}>⧉ コピーした文を貼り付ける</button>
                            <button className={`start-button ${tutorialChatInput.trim() ? "tutorial-next-action" : ""}`} type="button" disabled={!tutorialChatInput.trim()} onClick={sendTutorialPrompt}>みうへ送信する <b>→</b></button>
                          </div>
                        ) : (
                          <button className="start-button tutorial-copy-reply tutorial-next-action" type="button" onClick={copyTutorialReply}>{tutorialChatKind === "intro" ? "みうの返事を受け取ってゲームへ戻る" : "⧉ 【】の返答だけコピーしてゲームへ戻る"}</button>
                        )}
                      </div>
                  </section>
                </div>
              )}
            </div>
          )}

          {view === "guide" && (
            <div className="guide-view">
              <header className="guide-heading">
                <div><p className="step-label">HOW TO PLAY</p><h2>あそびかた</h2></div>
                <div className="guide-heading-tools"><NavigatorPair compact /><button className="back-button" type="button" onClick={() => setView("title")}>← 戻る</button></div>
              </header>

              <div className="guide-columns">
                <div className="guide-column">
                  <section className="rule-lead">
                    <div className="mini-grid" aria-hidden="true"><i /><i /><i /><i /><i /><i className="pink" /><i className="pink" /><i className="pink" /><i /><i /><i /><i /><i /><i /><i /><i /></div>
                    <div><strong>しりとり × 陣取り</strong><p>16枚の絵文字を交互に取り、タテ・ヨコ・ナナメのどれか一列を先に自分の色でそろえたら勝ち！ 「ん」で終わる読みを出したらその場で負け。どちらも列を作れなくなったら引き分け。</p></div>
                  </section>

                  <ol className="rule-steps">
                    <li><b>1</b><div><strong>今の文字を確認</strong><p>画面上の「この文字から」で、使う読みの最初の文字が決まるよ。</p></div></li>
                    <li><b>2</b><div><strong>絵文字を選び、読みを宣言</strong><p>正式プリセットは作者公認なのでそのまま成立。絵文字から一段階で追える自由読みには、理由も添えてね。</p></div></li>
                    <li><b>3</b><div><strong>最後の文字をつなぐ</strong><p>成立した読みの最後の文字が、次の手番の開始文字になるよ。「ん」で終わる読みを出した側は、その場で負け。</p></div></li>
                    <li><b>4</b><div><strong>自分のラインを作る</strong><p>取ったマスには陣営色のチップがつくよ。相手がそろえそうなマスを先に取って妨害してもOK！ 盤面に空きがあっても、どちらもタテ・ヨコ・ナナメを完成できなくなった時点で引き分け。</p></div></li>
                  </ol>
                </div>

                <div className="guide-column">
                  <section className="kojitsuke-guide">
                    <span className="guide-tag">このゲームの醍醐味</span>
                    <h3>見た目は一枚、読み方はたくさん！</h3>
                    <p>読みの正式分類は「正式プリセット」と「自由読み」の2つ。絵文字・名前・見た目から自由に読みを作れるよ。少し強引で創造的な自由読みを、遊び上「ゴネ読み」と呼ぶこともあるけれど、異議を出されやすくなる！</p>
                    <div className="example-reading"><span className="example-art">☂️</span><div><small>例：「り」から始めたい</small><strong>「りょこう」</strong><p>旅行へ持っていく傘だから！</p></div></div>
                    <p className="rule-caution">濁音・半濁音は清音とつないでOK（か↔が、は↔ば↔ぱ）。「うまそう」「かわいい」だけのように、どの札にも使える主観や強引な自由読みは異議対象になりやすいよ。</p>
                  </section>

                  <section className="partner-guide">
                    <div className="partner-guide-icon"><MirrorIcon small /></div>
                    <div><h3>AIパートナーとはコピーで連携</h3><p>最初に「対戦開始文」、ラリー中は「この手番」または「判定依頼」をワンタップコピーして、いつもの会話へ貼るだけ。座標・札ID・見た目・正式読みも一緒に渡るよ。</p><small>会話や自由読みを相談しながら、一緒に楽しめます</small></div>
                  </section>

                  <section className="quick-rules" aria-label="補足ルール">
                    <span>⚡ 異議札は各3枚</span><span>「ん」で終わると即敗北</span><span>両者ライン不能で引き分け</span><span>● ◆ 色とチップで陣営表示</span>
                  </section>

                  <div className="guide-actions">
                    <button className="start-button" type="button" onClick={openTutorial}>しゅ＆みうと練習 <b>→</b></button>
                    <button className="text-button" type="button" onClick={() => setView("title")}>タイトルへ戻る</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === "resume" && (
            <div className="start-content resume-content">
              <span className="save-badge">SAVE DATA FOUND</span>
              <h2>途中の試合が<br />残ってるよ。</h2>
              <div className="resume-summary">
                <div><small>現在文字</small><strong>{game.currentChar}</strong></div>
                <div><small>手番</small><strong>{currentName}</strong></div>
                <div><small>取得</small><strong>{Object.keys(game.claims).length}<span>/16</span></strong></div>
              </div>
              <button className="start-button" type="button" onClick={() => beginCountdown(true)}>続きから <b>→</b></button>
              <button className="secondary-start" type="button" onClick={() => setView("mode")}>新しく始める</button>
            </div>
          )}

          {view === "mode" && (
            <div className="start-content setup-content">
              <div className="setup-copy">
                <p className="step-label">STEP 1 / 2</p>
                <h2 className="mode-title"><span>だれと</span><span>遊ぶ？</span></h2>
                <p>AIパートナーとのコピー対戦か、同じ端末を使うふたり対戦を選んでね。</p>
              </div>
              <div className="setup-panel">
                <div className="mode-cards">
                  <button type="button" className={pendingMode === "partner" ? "selected" : ""} onClick={() => setPendingMode("partner")}>
                    <span className="mode-icon mirror-mode" aria-hidden="true">✦</span>
                    <strong>AIパートナー</strong><small>いつもの会話へ手番を渡す</small>
                  </button>
                  <button type="button" className={pendingMode === "local" ? "selected" : ""} onClick={() => setPendingMode("local")}>
                    <span className="mode-icon" aria-hidden="true">● ◆</span>
                    <strong>人間ふたり</strong><small>ひとつの端末を交互に使う</small>
                  </button>
                </div>
                <button className="start-button" type="button" onClick={() => setView("confirm")}>このモードで進む <b>→</b></button>
                <button className="text-button" type="button" onClick={() => setView("title")}>タイトルへ戻る</button>
              </div>
            </div>
          )}

          {view === "confirm" && (
            <div className="start-content setup-content confirm-content">
              <div className="setup-copy">
                <p className="step-label">STEP 2 / 2</p>
                <h2>ルール確認</h2>
                <p>標準ルールはひとつ。AIパートナーとの会話や自由読みを楽しもう。</p>
              </div>
              <div className="setup-panel">
                <dl className="settings-list">
                  <div><dt>モード</dt><dd>{pendingMode === "partner" ? "AIパートナー受け渡し" : "人間ふたり対戦"}</dd></div>
                  <div><dt>盤面</dt><dd>4 × 4 ／ 16枚</dd></div>
                  <div><dt>異議札</dt><dd>各陣営3枚</dd></div>
                  <div><dt>読み</dt><dd>正式プリセット／自由読み</dd></div>
                  <div><dt>即敗北</dt><dd>「ん」で終わる読み</dd></div>
                  <div><dt>引き分け</dt><dd>双方ライン完成不能</dd></div>
                </dl>
                <p className="confirm-note">タテ・ヨコ・ナナメの4枚ラインを、先に自分の色でそろえた側の勝ち！</p>
                <button className="start-button" type="button" onClick={() => beginCountdown(false)}>ゲームを始める <b>→</b></button>
                <button className="text-button" type="button" onClick={() => setView("mode")}>モードを選び直す</button>
              </div>
            </div>
          )}

          {view === "countdown" && (
            <div className="countdown-screen" aria-live="assertive">
              <small>{resumeAfterCountdown ? "READY TO RESUME" : "READY?"}</small>
              <strong className={countdown > 0 ? "countdown-number" : "countdown-go"}>
                <span>{countdown > 0 ? countdown : "GO!"}</span>
              </strong>
              <p>ことばを、つなげ。</p>
            </div>
          )}
        </section>

      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="game-layout">
        <section className="play-column">
          <section className={`status-card player-${game.turn.toLowerCase()}`} aria-live="polite">
            <div className="turn-block">
              <span className={`side-chip side-${game.turn.toLowerCase()}`} aria-hidden="true" />
              <div><small>いまの手番</small><strong>{currentName}</strong></div>
            </div>
            <div className="letter-block"><small>この文字から</small><strong>{game.currentChar}</strong></div>
            <div className="status-objections" aria-label="残り異議札">
              <span><i className="side-chip side-o" />{game.objections.O}</span>
              <span><i className="side-chip side-x" />{game.objections.X}</span>
            </div>
            <div className="status-actions">
              <button className="summary-toggle" type="button" onClick={() => setSummaryOpen(true)} aria-expanded={summaryOpen}>詳細</button>
              <button className="game-reset" type="button" onClick={openNewGameFlow} aria-label="新しいゲーム">↻</button>
            </div>
          </section>

          <section className={`board ${rejectionFlash ? "rejection-flash" : ""}`} aria-label="4×4のゲーム盤">
            {game.board.map((panel, index) => {
              const owner = game.claims[index];
              const selected = game.selectedIndex === index;
              const winning = game.winningLine.includes(index);
              const retryBlocked = game.retryBlocked.includes(index) && !owner;
              return (
                <button
                  key={panel.id}
                  type="button"
                  className={`tile ${owner ? `claimed ${owner.toLowerCase()}` : ""} ${selected ? "selected" : ""} ${winning ? "winning" : ""} ${retryBlocked ? "retry-blocked" : ""}`}
                  onClick={() => selectPanel(index)}
                  disabled={Boolean(owner) || retryBlocked || !game.partnerBriefed || game.phase !== "select" || Boolean(game.winner)}
                  aria-label={`${coordinate(index)} ${panel.name}${owner ? ` ${owner}が取得済み` : retryBlocked ? " 今回の再試行では選択不可" : ""}`}
                >
                  <span className="coordinate">{coordinate(index)}</span>
                  <span className="tile-art" aria-hidden="true"><PanelArtwork panel={panel} /></span>
                  {owner && <span className={`claim-chip claim-${owner.toLowerCase()}`} aria-hidden="true" />}
                  {retryBlocked && <span className="retry-lock" aria-hidden="true">異議</span>}
                </button>
              );
            })}
          </section>

          <p className={`game-message ${rejectionFlash ? "reject" : ""}`} aria-live="polite"><span>●</span>{message}</p>

          <section className="action-card">
            {game.phase === "select" && !game.winner && !game.partnerBriefed && (
              <div className="partner-briefing">
                <div className="partner-heading"><span><MirrorIcon small /></span><div><small>FIRST SETUP</small><h2>最初にルールを渡そう</h2></div></div>
                <p>パートナーが×側として迷わず参加できる説明文を、ワンタップで全文コピーするよ。</p>
                <button type="button" className="copy-button attention" onClick={copyPartnerIntro}>⧉ 対戦開始文をコピーして始める</button>
              </div>
            )}

            {game.phase === "select" && !game.winner && game.partnerBriefed && (
              <div className="empty-action">
                <div className="finger">☝️</div>
                <div><h2>絵文字をひとつ選ぶ</h2><p>プリセットがなくても、一段階で読めそうなら選んでOK。</p></div>
              </div>
            )}

            {game.phase === "reading" && !game.winner && selectedPanel && (
              <div className="reading-panel">
                <div className="selected-summary"><span><PanelArtwork panel={selectedPanel} compact /></span><div><small>{coordinate(game.selectedIndex!)} / {selectedPanel.category}</small><h2>{selectedPanel.name}</h2></div></div>
                {registeredOptions.length > 0 ? (
                  <div className="registered-readings"><small>正式プリセット</small><div>{registeredOptions.map((preset) => {
                    const reading = presetReadingValue(preset);
                    const display = presetReadingDisplay(preset);
                    const loses = readingEnd(reading) === "ん";
                    return <button type="button" className={loses ? "n-ending-option" : ""} key={`${display}:${reading}`} onClick={() => submitReading(reading, "")}>{display}<span>{loses ? "⚠ んで負け" : `→ ${readingEnd(reading)}`}</span></button>;
                  })}</div></div>
                ) : <p className="no-reading">「{game.currentChar}」につながる正式プリセットはなし。自由読みの出番！</p>}
                <div className="custom-form">
                  <label><span>自由な読み <b>「{game.currentChar}」から</b></span><input value={customReading} onChange={(event) => setCustomReading(event.target.value)} placeholder={`${game.currentChar}…`} /></label>
                  <label><span>そう読んだ理由 <b>自由読みは理由つき</b></span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="絵のどこから連想した？" rows={3} /></label>
                  <div className="button-row"><button type="button" className="secondary" onClick={cancelReading}>選び直す</button><button type="button" className="primary" onClick={() => submitReading(customReading, reason)}>この読みで宣言</button></div>
                </div>
              </div>
            )}

            {isPartnerWaiting && !game.winner && (
              <div className="partner-panel">
                <div className="partner-heading"><span><MirrorIcon small /></span><div><small>{game.phase === "partner-turn" ? "PARTNER TURN" : "KOJITSUKE CHECK"}</small><h2>{game.phase === "partner-turn" ? "パートナーに一手を預ける" : "こじつけを判定してもらう"}</h2></div></div>
                <p>手番コードをいつもの会話へ貼り、返答末尾の小さなコードブロックだけコピーして戻してね。回答全文を貼っても自動で読み取れるよ。</p>
                <div className="code-chip">手番コード <b>{game.activeCode}</b></div>
                <button type="button" className={`copy-button ${game.copied ? "copied" : "attention"}`} onClick={copyPrompt}>⧉ {game.copied ? "もう一度コピーする" : game.phase === "partner-turn" ? "この手番をコピー" : "判定依頼をコピー"}</button>
                <div className={`partner-waiting ${game.copied ? "active" : ""}`} aria-live="polite">{game.copied ? "パートナーの回答待ち… 戻ったら下へ貼り付けてね" : "まず上のボタンを押して、パートナーへ手番を渡してね"}</div>
                <label className="reply-box"><span>ここにパートナーの回答を貼り付ける</span><textarea rows={7} value={partnerReply} onChange={(event) => setPartnerReply(event.target.value)} placeholder="回答文をまるごと貼ってOK。最後の【手番:…】または【判定:…】を自動で読み取るよ。" /></label>
                <button type="button" className="primary wide" onClick={parsePartnerReply}>返答を盤面へ反映</button>
                <details className="prompt-preview"><summary>渡す文章を確認</summary><pre>{prompt}</pre></details>
              </div>
            )}

            {(game.phase === "local-judge" || game.phase === "player-judge") && game.proposal && (
              <div className="judge-panel">
                <p className="judge-kicker">こじつけ判定</p>
                <div className="proposal-card"><span><PanelArtwork panel={game.board[game.proposal.panelIndex]} compact /></span><div><small>{coordinate(game.proposal.panelIndex)} / {game.board[game.proposal.panelIndex].name}</small><h2>「{game.proposal.reading}」</h2><p>{game.proposal.reason}</p></div></div>
                <p className="judge-question">明確な違反なら無効。グレー、または勝負上止めたいなら異議札。納得したら受理！</p>
                <div className="judge-actions"><button type="button" className="invalid-button" onClick={invalidateLocalProposal}>× 違反で無効<small>札は減らない</small></button><button type="button" className="object-button" disabled={game.objections[game.proposal.player === "O" ? "X" : "O"] <= 0} onClick={() => judgeLocal(false)}>⚡ 異議を出す<small>札を1枚使う</small></button><button type="button" className="accept-button" onClick={() => judgeLocal(true)}>✓ 受理する<small>読みを成立</small></button></div>
              </div>
            )}

            {game.winner && (
              <div className="winner-panel">
                <div className="confetti">✦ ○ ✧ × ✦</div>
                <p>GAME SET!</p>
                <h2>{game.winner === "DRAW" ? "引き分け！" : `${game.winner === "O" ? "○" : "×"} ${game.winner === "O" ? (game.mode === "partner" ? "あなた" : "プレイヤー1") : (game.mode === "partner" ? "パートナー" : "プレイヤー2")}の勝ち！`}</h2>
                <p>{game.winReason === "n-ending" ? "『ん』で終わる読みを出したため、その場で勝負が決まりました。" : game.winner === "DRAW" ? Object.keys(game.claims).length < 16 ? "盤面に空きはあるけれど、どちらもラインを完成できなくなりました。" : "全マスを使ってもラインが完成しませんでした。" : "タテ・ヨコ・ナナメの一列が揃ったよ。"}</p>
                <button type="button" className="primary" onClick={openNewGameFlow}>もう一局あそぶ</button>
              </div>
            )}
          </section>
        </section>

      </div>

      <div className={`summary-layer ${summaryOpen ? "open" : ""}`} aria-hidden={!summaryOpen}>
        <button className="sheet-scrim" type="button" aria-label="詳細を閉じる" onClick={() => setSummaryOpen(false)} />
        <aside className="summary-sheet" role="dialog" aria-modal="true" aria-label="試合サマリー">
          <div className="sheet-handle" aria-hidden="true" />
          <header><div><span>MATCH SUMMARY</span><h2>試合サマリー</h2></div><button className="sheet-close" type="button" onClick={() => setSummaryOpen(false)} aria-label="閉じる">×</button></header>
          <section className="summary-now">
            <div><small>現在文字</small><strong>{game.currentChar}</strong></div>
            <div><small>手番</small><strong><i className={`side-chip side-${game.turn.toLowerCase()}`} />{currentName}</strong></div>
            <div><small>残り異議札</small><strong><i className="side-chip side-o" />{game.objections.O}<i className="side-chip side-x" />{game.objections.X}</strong></div>
          </section>
          <button type="button" className="copy-button share-copy-button" onClick={copyBoardLink}>⧉ 盤面リンクをコピー</button>
          <section className="history-card">
            <div className="section-title"><span>PLAY LOG</span><h2>ことばの足あと</h2></div>
            {game.history.length ? <ol>{[...game.history].reverse().slice(0, 12).map((item, index) => <li key={`${item.coordinate}-${index}`}><i className={`side-chip side-${item.player.toLowerCase()}`} /><span>{item.coordinate}</span><strong>{item.reading}</strong></li>)}</ol> : <p className="muted">最初の一手を待ってるよ。</p>}
          </section>
          <details className="rules-card">
            <summary><span>HOW TO PLAY</span><strong>あそびかた</strong><b>＋</b></summary>
            <ol><li><b>1</b><span>今の文字から読める絵文字を選ぶ</span></li><li><b>2</b><span>正式プリセット、または理由つきの自由読みを宣言</span></li><li><b>3</b><span>成立した読みの最後の文字を次へつなぐ。「ん」で終わればその場で負け</span></li><li><b>4</b><span>先に自分の色を一列そろえたら勝ち</span></li><li><b>5</b><span>双方とも列を完成できなくなった時点で引き分け</span></li></ol>
            <p>濁音・半濁音は清音と接続可能。明確な違反は異議札なしで無効、グレーな自由読みや戦略的な反対は異議札を1枚使うよ。</p>
          </details>
          <section className="prototype-note"><span>PROTOTYPE 02</span><p>共通性の高い絵文字48枚入り。正式プリセットは札ごとに必要な数だけ登録できるよ。</p></section>
        </aside>
      </div>
      <footer><b>MIRROR WORD GRID</b><span>ことばは、絵の中にひとつじゃない。</span></footer>
    </main>
  );
}
