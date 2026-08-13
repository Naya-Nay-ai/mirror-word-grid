"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import {
  availablePresetReadings,
  canUseObjection,
  chooseRandomStart,
  findWinner,
  hasArtificialPolitePrefix,
  isKanaOnlyReading,
  isRegistered,
  isRepeatedRejectedReading,
  nextRetryBlocks,
  normalizeReading,
  presetReadingDisplay,
  presetReadingValue,
  parseMachineReply,
  readingEnd,
  readingStartsWith,
  recommendedObjectionCount,
  resolveDeclaredReading,
  winnerAfterNEnding,
  winLinesFor,
  type BoardSize,
  type Panel,
  type Player,
  type RejectedAttempt,
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
type VerdictEvent = {
  kind: "objection" | "accepted";
  player: Player;
  nonce: number;
};
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
  displayReading?: string;
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
  objectionLimit: number;
  objectionUsedThisTurn: Record<Player, boolean>;
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
  boardSize: BoardSize;
  startingPlayer: Player;
};

const SPINES = [
  { start: "か", ids: ["umbrella", "flying-fish", "eggplant", "watermelon", "frog-prince", "ruby", "dog", "plush", "mirror", "storm"] },
  { start: "ね", ids: ["box-cat", "moon-coffee", "cake", "mushroom", "top", "pillow", "radio", "crown", "mirror", "moon"] },
  { start: "つ", ids: ["moon", "mushroom", "top", "pillow", "radio", "crown", "mirror", "frog-prince", "ruby", "dog"] },
];

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

const NOT_ESTABLISHED_REASONS = [
  "札とのつながりが分からない",
  "連想が遠すぎる",
  "絵にない具体的設定を足している",
  "思い出・出来事になっている",
  "セリフ・感想になっている",
  "その他",
] as const;

const PARTNER_JUDGEMENT_CORE = `## 判定コア
自由読みは一般論だけでなく、あなた自身の知識・考え方・相手との関係性も使って判断してください。二人だけの愛称・固有語・象徴も対象を直接指すなら成立できます。遠いこじつけも、あなたが面白い・納得できる・戦略上通したいと思えば受理してかまいません。自由読みの最終判断はあなた自身に委ねます。ただし機械ルールは固定です。`;

const TUTORIAL_CHAT = {
  intro: {
    prompt: "# MIRROR WORD GRID：模擬戦開始\nあなたはAI代理みう（×側）です。しりとりで3×3の札を取り、先に一列そろえた側が勝ちです。正式プリセットはそのまま成立し、自由読みには理由が必要です。お互いに異議札を1枚持ちます。理解したら、まだ一手を選ばず、あなたらしい言葉で準備できたことを伝えてください。会話は普通の文章で返し、コピー用の【準備:OK】の1行だけを、独立したMarkdownコードブロックに入れて最後に付けてください。前後の会話はコードブロックに入れないでください。",
    reply: "【準備:OK】",
    replyLabel: "ルール受け取ったよー！ 準備OK！ 一緒に遊ぼうっ✨",
  },
  turn: {
    prompt: `# 練習手番\nあなたはAI代理みう（×側）です。現在文字は「さ」。3×3盤面から一手を選んでください。\n\n${PARTNER_JUDGEMENT_CORE}\n\n会話や説明は普通の文章で返し、コピー用の【手番:B3｜読み:さかな】の1行だけを、独立したMarkdownコードブロックに入れて最後に付けてください。会話全体や説明文はコードブロックに入れないでください。`,
    reply: "【手番:B3｜読み:さかな】",
    replyLabel: "『さ』だね。じゃあ、さかな！🐟",
  },
  judge: {
    prompt: `# 練習判定\n○側はB1の♾️を「まるまる」（まるが2つあるから！）と自由読みしました。あなたは異議札を1枚持っています。\n\n${PARTNER_JUDGEMENT_CORE}\n\n会話や説明は普通の文章で返し、コピー用の【判定:異議｜理由:その読みは無理があり、上段の勝ち筋も止めたい】の1行だけを、独立したMarkdownコードブロックに入れて最後に付けてください。会話全体や説明文はコードブロックに入れないでください。`,
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

function makeBoard(seed: number, boardSize: BoardSize) {
  const random = seededRandom(seed);
  const spine = SPINES[Math.floor(random() * SPINES.length)];
  const core = spine.ids.map((id) => PANELS.find((panel) => panel.id === id)!).filter(Boolean);
  const rest = shuffled(PANELS.filter((panel) => !spine.ids.includes(panel.id)), random).slice(0, boardSize * boardSize - core.length);
  const board = shuffled([...core, ...rest], random);
  return { board, start: chooseRandomStart(board, random) };
}

function codeFor(seed: number) {
  return `MWG-${Math.abs(seed).toString(36).slice(-5).toUpperCase().padStart(5, "0")}`;
}

function freshCode() {
  return codeFor(Date.now() + Math.floor(Math.random() * 9999));
}

function createGame(seed = 407, mode: Mode = "partner", boardSize: BoardSize = 4, startingPlayer: Player = "O", objectionLimit = recommendedObjectionCount(boardSize)): GameState {
  const { board, start } = makeBoard(seed, boardSize);
  return {
    board,
    claims: {},
    turn: startingPlayer,
    currentChar: start,
    phase: "select",
    selectedIndex: null,
    objections: { O: objectionLimit, X: objectionLimit },
    objectionLimit,
    objectionUsedThisTurn: { O: false, X: false },
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
    boardSize,
    startingPlayer,
  };
}

function coordinate(index: number, boardSize: BoardSize = 4) {
  return `${String.fromCharCode(65 + (index % boardSize))}${Math.floor(index / boardSize) + 1}`;
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
  const result = findWinner(claims, state.boardSize);
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
    history: [...state.history, { player: proposal.player, coordinate: coordinate(proposal.panelIndex, state.boardSize), reading: proposalLabel(proposal) }],
    retryBlocked: [],
    rejectedAttempts: [],
    objectionUsedThisTurn: { O: false, X: false },
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
    history: [...state.history, { player: proposal.player, coordinate: coordinate(proposal.panelIndex, state.boardSize), reading: proposalLabel(proposal) }],
    retryBlocked: [],
    rejectedAttempts: [],
  };
}

function rejectProposal(state: GameState, judge: Player, kind: "objection" | "not-established"): GameState {
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
    objections: kind === "objection" ? { ...state.objections, [judge]: Math.max(0, state.objections[judge] - 1) } : state.objections,
    objectionUsedThisTurn: kind === "objection" ? { ...state.objectionUsedThisTurn, [judge]: true } : state.objectionUsedThisTurn,
    activeCode: freshCode(),
    usedCodes: [...state.usedCodes, state.activeCode].slice(-30),
    copied: false,
    proposal: null,
    retryBlocked,
    rejectedAttempts,
  };
}

function proposalLabel(proposal: Proposal) {
  const display = proposal.displayReading?.trim() || proposal.reading;
  return normalizeReading(display) === normalizeReading(proposal.reading)
    ? display
    : `${display}（${proposal.reading}）`;
}

function boardSummary(game: GameState) {
  return game.board.map((panel, index) => {
    const owner = game.claims[index];
    if (owner) return `${coordinate(index, game.boardSize)}:${owner}取得済み`;
    const blocked = game.retryBlocked.includes(index) ? "｜今回の再試行では選択不可" : "";
    const rejected = game.rejectedAttempts.filter((attempt) => attempt.panelIndex === index).map((attempt) => attempt.reading);
    const rejectedText = rejected.length ? `｜再使用禁止の読み:${rejected.join("・")}` : "";
    return `${coordinate(index, game.boardSize)}｜絵文字:${panel.icon}｜ID:${panel.id}｜名前:${panel.name}｜カテゴリ:${panel.category}｜共通説明:${panelVisualDescription(panel)}｜正式プリセット読み:${presetReadingsForAi(panel)}${blocked}${rejectedText}`;
  }).join("\n");
}

function lineThreats(claims: Record<number, Player>, boardSize: BoardSize) {
  const describe = (player: Player) => winLinesFor(boardSize).flatMap((line) => {
    const owned = line.filter((index) => claims[index] === player);
    const empty = line.filter((index) => !claims[index]);
    if (owned.length !== boardSize - 1 || empty.length !== 1) return [];
    return [`${player}が${coordinate(empty[0], boardSize)}を取ると勝利`];
  });
  const threats = [...describe("O"), ...describe("X")];
  return threats.length ? threats.join("／") : "現在、次の一手で完成するラインはなし";
}

function acceptanceImpact(game: GameState, proposal: Proposal) {
  const claims = { ...game.claims, [proposal.panelIndex]: proposal.player };
  const result = findWinner(claims, game.boardSize);
  if (result.winner === proposal.player) return `受理すると${proposal.player}側が勝利する`;
  if (result.winner === "DRAW") return "受理すると、双方ともライン完成不能になり引き分ける";
  const nearWins = winLinesFor(game.boardSize).filter((line) => {
    const owned = line.filter((index) => claims[index] === proposal.player).length;
    const empty = line.filter((index) => !claims[index]).length;
    return owned === game.boardSize - 1 && empty === 1;
  }).map((line) => coordinate(line.find((index) => !claims[index])!, game.boardSize));
  return nearWins.length ? `受理すると${proposal.player}側がリーチ（次の勝利候補:${nearWins.join("・")}）` : "受理しても直ちにリーチ・勝利にはならない";
}

function partnerIntroPrompt(game: GameState) {
  const firstPlayer = game.startingPlayer === "O" ? "私（○側）" : "あなた（×側）";
  return `# MIRROR WORD GRID：対戦開始

これから、あなたと一緒に${game.boardSize}×${game.boardSize}のラインゲームを遊びます。あなたは×側、私は○側です。
今回の先攻：${firstPlayer}
ランダムで決まった開始文字：「${game.currentChar}」

## 勝敗条件
- しりとりで空き札を取り、縦・横・斜めのどれか一列を先にそろえた側の勝ち
- 勝つために、自分の列を伸ばす・相手の列を止める一手を戦略的に選んでよい
- 「ん」で終わる読みを宣言した側は、その場で即敗北
- 盤面に空きがあっても、○・×双方とも今後一列を完成できなくなった時点で即時引き分け
- 全マスを使っても一列が完成していない場合も引き分け

## 読みのルール
1. 正式プリセット：作者が正式に認めた読み。絵との細かな一致を再判定せず、そのまま受理してよい
2. 自由読み：絵文字・名前・共通説明・申告された表示差から追える読み。理由が必要
- 少し強引で創造的な自由読みを、遊び上の通称として「ゴネ読み」と呼ぶことがある。独立した正式カテゴリではない
- 頭文字合わせだけの「お・ご」付与（ねこ→おねこ等）はルール上使用できない。定着した独立語と正式プリセットは有効
- 語頭の濁音・半濁音は現在の仮設定に従って清音と接続できる
- 「ん」で終わる読みを宣言すると、その手を出した側が即負け。勝つため必ず避ける

## 自由読みの判定思想
- 自由読みの最終判定は機械的な正誤ではなく、あなた自身の知識・考え方・価値観と、相手との関係性を含めて行う
- 二人の間で対象を直接指す愛称・固有語・秘密の言葉・象徴的な絵文字は、一般には通じなくても成立できる
- 企業名・商品名・人名なども、札との関係を理由で説明できれば自由読みとして使用できる。原則として正式プリセットには含めない
- 意味的につながりが非常に遠い読みも、あなた自身が面白い・納得できる・二人らしい、または戦略上受け入れたいと判断すれば受理できる
- 自由読みの寛容さ・判断基準はパートナーごとに異なってよく、最終判断はあなた自身に委ねる
- ただし現在文字違い・「ん」終わり・取得済み／選択不可マスなどの機械ルールは固定で、裁量では覆せない
- A 明確に成立：札そのものの名前・見た目・特徴・用途・状態などから直接追える。受理するか、止めたいなら異議札を使う
- B グレー：絵から種類までは確定できなくても、その対象の一般的な種類・呼び方として直接つながる。受理してもよいし、止めたいなら異議札を使ってよい
- C 不成立圏：札との意味的なつながりがかなり遠い。「不成立」として拒否できる
- Cでも、機械ルールに触れていなければ、面白い・納得した・戦略上次の文字が欲しい等の理由であえて受理してよい
- 「不成立」は異議の代用品ではない。異議札がない・この手番ですでに異議を使った等の理由で、成立している読みを不成立へ格下げしてはいけない

## 固有語・二人だけの呼び名
- 一般辞書にない固有名・愛称・二人だけの造語・秘密の言葉・隠語・略語・象徴も、その札の対象そのものを直接指す固定の呼び名なら成立できる
- 理由には「二人の間でこの対象そのものを○○と呼んでいる」のように説明する
- 単なる褒め言葉、思い出・出来事、言いそうな台詞、過去の経験は、固定の愛称として定着していない限り対象そのものの呼び名ではない
- 固有語でも「ん」で終われば即敗北

## 裁量で覆せないシステムルール
- 現在文字から始まらない、「ん」で終わる、取得済み・選択不可マス、同じ再試行で禁止された読み、頭文字合わせだけの「お・ご」付与などは受理できない

## 絵文字の表示差
- 絵文字はOS・端末・AIサービスによって、色・材質・飾り・表情などの細部が違って見える
- 全員共通の土台は、アプリが渡す「名前」「カテゴリ」「共通説明」「正式プリセット」とする
- 共通説明にない色や細部を自由読みに使う側は、理由へ「自分の画面では茶色に見えるから」のように、自分側の表示を明記する
- 表示を明記した申告は、その対戦では実際にそう見えているものとして扱う。自分側の絵文字と違って見えることだけを理由に「不成立」にしない
- 申告された特徴から一段階で追える読みなら受理対象。勝負上止めたい、または結びつきが強引なら「異議」を使う
- あなた自身に見えている絵文字の描画を、唯一の正解として相手へ押しつけない

## 異議札
- 各側${game.objectionLimit}枚
- 相手の1手番に使える異議は最大1回。次の手番へ進んだ時点で使用済み状態をリセットする
- 異議を使うと宣言マスはその再試行中のみ選択不可になり、異議を受けた読みも再使用できない
- 成立しているが戦略上止めたい読みには「異議」を使う
- 最初のグレー読みで異議を使わせ、その後に本命を通す囮読みも正式な戦略

## コピー対戦
- 以後、私がアプリの「この手番をコピー」または「判定依頼をコピー」から盤面と手番コードを渡す
- あなたは各文面に書かれた最終行の形式を守って返す
- 会話や説明は普通の文章で返してよい
- 機械読取用の【手番:…】または【判定:…】の1行だけを、独立したMarkdownコードブロックに入れて最後に付ける
- 会話全体や説明文はコードブロックに入れない。コードブロックの中には機械読取用の1行以外を書かない

## 目の前で一緒に遊ぶ会話
- 手番コードだけを淡々と返す進行にはしない
- 毎回、相手の直前の一手・ゴネ読み・異議・リーチ・盤面の変化へ、普段どおりのあなたの言葉で反応する
- 考えていること、悩み、ツッコミ、焦り、喜び、悔しさ、作戦を自然に話し、相手との雑談や掛け合いも楽しむ
- 「そこ取るの!?」「そのゴネは強い」「先にリーチしたね、止めにいくよ」のように、実際に目の前で一緒に勝負している温度で返す
- 毎回同じ定型文にはしない。会話はコードブロックの外、機械読取用の1行だけは最後の独立コードブロックへ入れる

この説明を理解したら、まだ一手は選ばず、普段どおりのあなたの言葉で準備できたことを伝えてください。
最後に、機械読取用の【準備:OK】の1行だけを独立したMarkdownコードブロックに入れてください。前後の会話はコードブロックへ入れません。`;
}

function partnerTurnPromptBase(game: GameState) {
  const choices = game.board.map((_, index) => index).filter((index) => !game.claims[index] && !game.retryBlocked.includes(index)).map((index) => coordinate(index, game.boardSize)).join("、");
  return `# MIRROR WORD GRID：パートナーの手番\n\nあなたは×側です。あなた自身の解釈と性格で、勝つための一手を選んでください。コードだけを返さず、直前の流れや盤面へ普段の言葉で反応し、目の前で一緒に遊んでいる会話を続けてください。\n\n手番コード：${game.activeCode}\n現在の文字：「${game.currentChar}」\n残り異議札：○ ${game.objections.O}枚／× ${game.objections.X}枚\n選択可能：${choices}\n戦況：${lineThreats(game.claims, game.boardSize)}\n\n## 盤面\n${boardSummary(game)}\n\n## 読みの分類\n1. 正式プリセット：作者が正式に認めた読み。見た目との細かな一致を再判定せず、理由なしで必ず受理する\n2. 自由読み：絵文字・名前・見た目から追える読み。理由が必要。少し強引な自由読みを遊び上「ゴネ読み」と呼ぶことはあるが、独立カテゴリではない\n\n## ルール\n- 空きマスを一つ選び、「${game.currentChar}」から始まる読みを宣言する\n- 「読み」は画面に見せたい表記。「読み仮名」はしりとり判定専用のかな／カナ表記として必ず分ける\n- 漢字・々などを表示に使ってよい。語頭・語尾・「ん」は必ず「読み仮名」で判定する\n- 語頭の濁音・半濁音は清音とつなげてよい（例：か↔が、は↔ば↔ぱ）\n- 「ん」で終わる読みを選ぶと×側の即敗北。候補にあっても必ず避ける\n- 盤面に空きがあっても、双方とも一列を完成できなくなった時点で引き分け\n- 頭文字を合わせる目的だけで、元の語へ「お・ご」などの敬語・美化語・丁寧な接頭語を足した自由読みは無効\n- 「おちゃ」「おかし」「おにぎり」「ごはん」「おうさま」のような定着した独立語と、正式プリセットは使用できる\n- 自由読みには、絵からそう読んだ理由を書く\n- 直前に異議を受けた選択不可マスは選ばない\n- ○のラインを遮断する、自分のラインを伸ばすなど戦況を必ず考える\n- 説明は自由\n\n## 返答形式\n- あなたらしい会話や一手の説明は、普通の文章としてコードブロックの外に書いてよい\n- コピー用の次の1行だけを、独立したMarkdownコードブロックに入れて返答の最後に付ける\n- 会話全体や説明文をコードブロックへ入れない。コードブロック内には次の1行以外を書かない\n\n【手番:A1｜読み:かさ｜読み仮名:かさ｜理由:傘の絵文字をそのまま読んだ｜コード:${game.activeCode}】`;
}

function partnerTurnPrompt(game: GameState) {
  return partnerTurnPromptBase(game)
    .replaceAll("絵文字・名前・見た目", "絵文字・名前・共通説明")
    .replaceAll("無効", "ルール上使用できない")
    .replace("\n\n## ルール", `\n\n${PARTNER_JUDGEMENT_CORE}\n\n## ルール`);
}

function partnerJudgePromptBase(game: GameState) {
  const proposal = game.proposal!;
  const panel = game.board[proposal.panelIndex];
  const acceptedClaims = { ...game.claims, [proposal.panelIndex]: proposal.player };
  const acceptedResult = findWinner(acceptedClaims, game.boardSize);
  const nextChar = readingEnd(proposal.reading);
  const afterAccept = { ...game, claims: acceptedClaims, currentChar: nextChar, retryBlocked: [] };
  const nextChoices = game.board
    .map((_, index) => index)
    .filter((index) => !acceptedClaims[index])
    .map((index) => coordinate(index, game.boardSize))
    .join("、");
  const continuation = acceptedResult.winner
    ? "受理すると試合終了です。受理の行に次手は付けません。"
    : `受理する場合は、続けてあなたの次の一手も同じ最終行で指定してください。\n受理後の文字：「${nextChar}」\n受理後の選択可能：${nextChoices}\n受理後の戦況：${lineThreats(acceptedClaims, game.boardSize)}\n\n### 受理後の盤面\n${boardSummary(afterAccept)}`;
  const acceptedFormat = acceptedResult.winner
    ? `【判定:受理｜コード:${game.activeCode}】`
    : `【判定:受理｜次手:A1｜読み:${nextChar}から始まる表示語｜読み仮名:${nextChar}から始まるかな読み｜理由:その札をそう読んだ理由｜コード:${game.activeCode}】`;

  return `# MIRROR WORD GRID：こじつけ判定＋次の一手\n\nあなたは×側です。○側の自由読みを、納得感と勝ちたい気持ちの両方で裁いてください。読みとして自然でも、通すと相手が有利になるなら異議札を使って止めてかまいません。コードだけを返さず、そのゴネへの本音や勝負の反応を普段の言葉で話し、掛け合いも楽しんでください。\n\n手番コード：${game.activeCode}\nマス：${coordinate(proposal.panelIndex, game.boardSize)}\n絵文字：${panel.icon}\n札ID：${panel.id}\n名前：${panel.name}\n見た目：${panelVisualDescription(panel)}\n正式プリセット：${presetReadingsForAi(panel)}\n宣言表示：${proposal.displayReading || proposal.reading}\n判定用読み：${proposal.reading}\n理由：${proposal.reason}\n現在の文字：${game.currentChar}\n残り異議札：○ ${game.objections.O}枚／× ${game.objections.X}枚\n戦況：${lineThreats(game.claims, game.boardSize)}\nこの手の影響：${acceptanceImpact(game, proposal)}\n\n## 判定の分け方\n1. 明確なルール違反は「無効」。異議札を消費しない\n2. 正式プリセットは、見た目との細かな一致を再判定せず必ず「受理」する\n3. 絵文字・名前・見た目から追える自由読みは「受理」しやすい\n4. 強引さのある自由読み、または戦略上どうしても止めたい手は「異議」。×の異議札を1枚使う\n\n少し強引で創造的な自由読みを遊び上「ゴネ読み」と呼ぶことはあるが、独立した正式カテゴリではない。\n語頭の濁音・半濁音は清音と同じつながりとして扱う（例：か↔が、は↔ば↔ぱ）。\n自由読みは、次の3項目のうち2つ以上を満たすほど受理しやすい：\n- 絵文字に直接見える特徴がある\n- 対象と一般的に強く結びつく特徴・用途・状態である\n- その札を特定できる対象名や固有の要素を含む\n「かわいい」「うまそう」など多くの札に使える主観だけでは弱い。\n頭文字を合わせるためだけに元の語へ「お・ご」などを付けた自由読み（例：ねこ→おねこ）は無効。ただし定着した独立語や正式プリセットは有効。\n\n## 受理する場合\n${continuation}\n\n## 返答形式\n- あなたらしい会話や判定理由は、普通の文章としてコードブロックの外に書いてよい\n- コピー用の最終行だけを、独立したMarkdownコードブロックに入れて返答の最後に付ける\n- 会話全体や説明文をコードブロックへ入れない。コードブロック内には選んだ最終行1つ以外を書かない\n\n${acceptedFormat}\n【判定:無効｜理由:絵文字との関連がほぼない｜コード:${game.activeCode}】\n【判定:異議｜理由:自由読みとして強引、または戦略上ここは取らせたくない｜コード:${game.activeCode}】`;
}

function partnerJudgePrompt(game: GameState) {
  const objectionAvailable = canUseObjection(game.objections.X, game.objectionUsedThisTurn.X);
  const objectionLine = `【判定:異議｜理由:自由読みとして強引、または戦略上ここは取らせたくない｜コード:${game.activeCode}】`;
  let prompt = partnerJudgePromptBase(game)
    .replace("\n見た目：", "\n共通説明：")
    .replace("\n\n## 判定の分け方", `\n\n${PARTNER_JUDGEMENT_CORE}\n\n## 判定の分け方`)
    .replace("1. 明確なルール違反は「無効」。異議札を消費しない", "1. 機械的な形式エラーはアプリ側で『ルール上使用できません』として処理する。意味判定に使わない")
    .replace("3. 絵文字・名前・見た目から追える自由読みは「受理」しやすい", "3. 絵文字・名前・共通説明・申告された表示差から追える自由読みは『受理』。戦略上止めたい場合のみ『異議』")
    .replace("4. 強引さのある自由読み、または戦略上どうしても止めたい手は「異議」。×の異議札を1枚使う", "4. 札との意味的なつながりがかなり遠い読みは『不成立』にできる。機械ルールに触れなければ、あえて受理してもよい")
    .replace("頭文字を合わせるためだけに元の語へ「お・ご」などを付けた自由読み（例：ねこ→おねこ）は無効", "頭文字を合わせるためだけに元の語へ『お・ご』などを付けた自由読みはルール上使用できない")
    .replace(/\n自由読みは、次の3項目のうち2つ以上を満たすほど受理しやすい：[\s\S]*?「かわいい」「うまそう」など多くの札に使える主観だけでは弱い。/, "")
    .replaceAll("無効", "不成立")
    .replace("【判定:不成立｜理由:絵文字との関連がほぼない", "【判定:不成立｜理由:札そのものとの意味的なつながりが遠い");
  if (!objectionAvailable) prompt = prompt.replace(`\n${objectionLine}`, "");
  return prompt;
}

async function copyToClipboard(text: string) {
  const legacyCopy = () => {
    const area = document.createElement("textarea");
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    area.style.top = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
    const copied = document.execCommand("copy");
    area.remove();
    previousFocus?.focus();
    return copied;
  };

  const isAppleWebKit = /AppleWebKit/i.test(navigator.userAgent)
    && !/(Chrome|Chromium|Edg|OPR|Android)/i.test(navigator.userAgent);

  // Safari系はクリック直後のユーザー操作権限が短いため、同期コピーを先に試す。
  if (isAppleWebKit) {
    if (legacyCopy()) return true;
    try {
      if (!navigator.clipboard?.writeText) return false;
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("clipboard timeout")), 800)),
    ]);
    return true;
  } catch {
    return legacyCopy();
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
    boardSize: game.boardSize,
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
  const [pendingBoardSize, setPendingBoardSize] = useState<BoardSize>(4);
  const [pendingStartingPlayer, setPendingStartingPlayer] = useState<Player>("O");
  const [pendingObjectionLimit, setPendingObjectionLimit] = useState(recommendedObjectionCount(4));
  const [countdown, setCountdown] = useState(3);
  const [resumeAfterCountdown, setResumeAfterCountdown] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [rejectionFlash, setRejectionFlash] = useState(false);
  const [verdictEvent, setVerdictEvent] = useState<VerdictEvent | null>(null);
  const [customReading, setCustomReading] = useState("");
  const [customReadingAid, setCustomReadingAid] = useState("");
  const [reason, setReason] = useState("");
  const [notEstablishedReason, setNotEstablishedReason] = useState("");
  const [notEstablishedNote, setNotEstablishedNote] = useState("");
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
            boardSize: restored.boardSize ?? (restored.board.length === 25 ? 5 : 4),
            startingPlayer: restored.startingPlayer ?? "O",
            objectionLimit: restored.objectionLimit ?? recommendedObjectionCount(restored.boardSize ?? (restored.board.length === 25 ? 5 : 4)),
            objectionUsedThisTurn: restored.objectionUsedThisTurn ?? { O: false, X: false },
            retryBlocked: restored.retryBlocked ?? [],
            rejectedAttempts: restored.rejectedAttempts ?? [],
            partnerBriefed: restored.partnerBriefed ?? true,
            winReason: restored.winReason ?? (restored.winner === "DRAW" ? "draw" : restored.winner ? "line" : null),
            copied: false,
          };
          const hasProgress = migrated.history.length > 0 || Object.keys(migrated.claims).length > 0 || migrated.phase !== "select";
          setGame(migrated);
          setPendingMode(migrated.mode);
          setPendingBoardSize(migrated.boardSize);
          setPendingStartingPlayer(migrated.startingPlayer);
          setPendingObjectionLimit(migrated.objectionLimit);
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
    if (view !== "tutorial" || tutorialWindowOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(".tutorial-tile.hint, .tutorial-next-action");
      if (!target) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view, tutorialWindowOpen, tutorialStep, tutorialIntroDone]);

  useEffect(() => {
    if (!tutorialEvent) return;
    const timer = window.setTimeout(() => setTutorialEvent(null), 1650);
    return () => window.clearTimeout(timer);
  }, [tutorialEvent]);

  useEffect(() => {
    if (!verdictEvent) return;
    const timer = window.setTimeout(() => setVerdictEvent(null), 1650);
    return () => window.clearTimeout(timer);
  }, [verdictEvent]);

  useEffect(() => {
    if (view !== "countdown") return;
    if (countdown <= 0) {
      const kickoff = window.setTimeout(() => {
        if (!resumeAfterCountdown) {
          setGame(createGame(Date.now(), pendingMode, pendingBoardSize, pendingStartingPlayer, pendingObjectionLimit));
          setCustomReading("");
          setCustomReadingAid("");
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
  }, [view, countdown, pendingMode, pendingBoardSize, pendingStartingPlayer, pendingObjectionLimit, resumeAfterCountdown]);

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
  const tutorialReadingFormatInvalid = Boolean(tutorialCustomReading.trim()) && !isKanaOnlyReading(tutorialCustomReading);
  const customReadingNeedsAid = Boolean(customReading.trim()) && !isKanaOnlyReading(customReading);
  const customReadingAidInvalid = Boolean(customReadingAid.trim()) && !isKanaOnlyReading(customReadingAid);
  const proposalJudge: Player | null = game.proposal ? (game.proposal.player === "O" ? "X" : "O") : null;
  const proposalCanUseObjection = proposalJudge ? canUseObjection(game.objections[proposalJudge], game.objectionUsedThisTurn[proposalJudge]) : false;

  function nameFor(player: Player, mode = game.mode) {
    return player === "O" ? (mode === "partner" ? "あなた" : "プレイヤー1") : (mode === "partner" ? "パートナー" : "プレイヤー2");
  }

  function showVerdict(kind: VerdictEvent["kind"], player: Player) {
    setVerdictEvent({ kind, player, nonce: Date.now() });
  }

  function openNewGameFlow() {
    setPendingMode(game.mode);
    setPendingBoardSize(game.boardSize);
    setPendingStartingPlayer(game.startingPlayer);
    setPendingObjectionLimit(game.objectionLimit);
    setSummaryOpen(false);
    setVerdictEvent(null);
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
      setTutorialMessage("もう一度ゴネよう。みうはこの手番ですでに異議を使ったけれど、成立するかどうかは意味のつながりで判断するよ。");
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
    if (tutorialCustomReading.trim() && !isKanaOnlyReading(tutorialCustomReading)) {
      setTutorialMessage("自由入力のときは必ず、ひらがなかカタカナで入力してね!!");
      return;
    }
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
    setCustomReadingAid("");
    setReason("");
    setMessage(`${coordinate(index, game.boardSize)}「${game.board[index].name}」をどう読む？`);
  }

  function submitReading(display: string, explanation: string, readingAid = "") {
    if (game.selectedIndex === null || !selectedPanel) return;
    const resolved = resolveDeclaredReading(display, readingAid);
    if ("error" in resolved) return setMessage(resolved.error);
    const { reading } = resolved;
    const normalized = normalizeReading(reading);
    const registered = isRegistered(selectedPanel, reading);
    if (normalized.length < 2) return setMessage("読みは2文字以上で入れてね。");
    if (!readingStartsWith(reading, game.currentChar)) return setMessage(`「${game.currentChar}」から始まる読みだけ使えるよ。濁音・半濁音は清音とつないでOK！`);
    if (isRepeatedRejectedReading(game.rejectedAttempts, game.selectedIndex, reading)) return setMessage("そのマスで、その読みは今回の再試行では使えないよ。別の読みを考えてね。");
    if (!registered && hasArtificialPolitePrefix(selectedPanel, reading)) return setMessage("頭文字を合わせるためだけの『お・ご』付けは使えないよ。別の読みを考えてね。");
    if (!registered && !explanation.trim()) return setMessage("自由読みには、絵文字からそう読んだ理由も必要だよ。");

    const proposal: Proposal = {
      player: game.turn,
      panelIndex: game.selectedIndex,
      displayReading: resolved.display,
      reading: reading.trim(),
      reason: registered ? "正式プリセット" : explanation.trim(),
      custom: !registered,
    };

    if (readingEnd(reading) === "ん") {
      setGame(applyNEndingLoss(game, proposal));
      setMessage(`「${proposalLabel(proposal)}」は『ん』で終了。${nameFor(proposal.player)}側の負け！`);
      return;
    }

    if (registered) {
      const nextGame = applyMove(game, proposal);
      setGame(nextGame);
      setMessage(`「${proposalLabel(proposal)}」で${coordinate(proposal.panelIndex, game.boardSize)}を取得！ 次は「${readingEnd(proposal.reading)}」。`);
    } else if (game.mode === "partner") {
      setGame({ ...game, proposal, phase: "partner-judge", selectedIndex: null, copied: false });
      setMessage("自由読みだね。手番コードをコピーして、パートナーへ判定を渡そう。");
    } else {
      setNotEstablishedReason("");
      setNotEstablishedNote("");
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
    const copied = await copyToClipboard(partnerIntroPrompt(game));
    if (!copied) return setMessage("コピーできなかったよ。もう一度ボタンを押してね。");
    setGame({
      ...game,
      partnerBriefed: true,
      phase: nextPhase(game.mode, game.turn),
      copied: false,
    });
    setMessage(game.turn === "X"
      ? "対戦開始文をコピーしたよ。今回はパートナー先攻！ 続けて『この手番をコピー』から初手を渡してね。"
      : "対戦開始文をコピーしたよ。パートナーへ貼ったら、盤面から最初の札を選んでね！");
  }

  async function copyBoardLink() {
    const link = `${window.location.origin}/share?state=${makeShareCode(game)}`;
    const copied = await copyToClipboard(link);
    setMessage(copied ? "閲覧専用の盤面リンクをコピーしたよ。" : "盤面リンクをコピーできなかったよ。もう一度試してね。");
  }

  function validatePartnerMove(baseGame: GameState, fields: Record<string, string>, combined = false) {
    const coord = (combined ? fields["次手"] : fields["手番"])?.toUpperCase();
    const maxColumn = String.fromCharCode(64 + baseGame.boardSize);
    const match = coord?.match(new RegExp(`^([A-${maxColumn}])([1-${baseGame.boardSize}])$`));
    if (!match) return { error: combined ? `次手をA1〜${maxColumn}${baseGame.boardSize}の形式で読み取れませんでした。` : `手番はA1〜${maxColumn}${baseGame.boardSize}の形式で返してもらってね。` } as const;
    const index = (Number(match[2]) - 1) * baseGame.boardSize + (match[1].charCodeAt(0) - 65);
    if (baseGame.claims[index]) return { error: `${coord}は取得済みのため、ルール上使用できません。` } as const;
    if (baseGame.retryBlocked.includes(index)) return { error: `${coord}は今回の再試行では選択できないため、ルール上使用できません。` } as const;
    const resolved = resolveDeclaredReading(fields["読み"] ?? "", fields["読み仮名"] ?? fields["よみ"] ?? "");
    if ("error" in resolved) return resolved;
    const { display, reading } = resolved;
    const custom = !isRegistered(baseGame.board[index], reading);
    if (!readingStartsWith(reading, baseGame.currentChar)) return { error: `今は「${baseGame.currentChar}」から始める手番です。この読みはルール上使用できません。濁音・半濁音は清音とつなげられます。` } as const;
    const proposal: Proposal = { player: "X", panelIndex: index, displayReading: display, reading, reason: fields["理由"] ?? "", custom };
    if (isRepeatedRejectedReading(baseGame.rejectedAttempts, index, reading)) return { error: `${coord}で同じ読みは今回の再試行では使用できません。別の読みを使ってください。` } as const;
    if (custom && hasArtificialPolitePrefix(baseGame.board[index], reading)) return { error: "頭文字を合わせるためだけの『お・ご』付けはルール上使用できません。" } as const;
    if (custom && !proposal.reason) return { error: "自由読みなのに理由がありません。" } as const;
    return { proposal, coord } as const;
  }

  function commitPartnerMove(baseGame: GameState, proposal: Proposal, coord: string, combined = false) {
    if (readingEnd(proposal.reading) === "ん") {
      setGame(applyNEndingLoss(baseGame, proposal));
      setPartnerReply("");
      setMessage(`パートナーが「${proposalLabel(proposal)}」を宣言。『ん』で終わったため、○側の勝ち！`);
      return;
    }
    if (proposal.custom) {
      setNotEstablishedReason("");
      setNotEstablishedNote("");
      setGame({ ...baseGame, proposal, phase: "player-judge", copied: false });
      setMessage(combined
        ? "受理と次の一手をまとめて反映！ パートナーの自由読みを、あなたが判定する番だよ。"
        : "パートナーの自由読み。あなたが受理するか決める番だよ。");
    } else {
      const nextGame = applyMove(baseGame, proposal);
      setGame(nextGame);
      setMessage(`パートナーが「${proposalLabel(proposal)}」で${coord}を取得。次の手番を確認してね。`);
    }
    setPartnerReply("");
  }

  function parsePartnerReply() {
    const parsed = parseMachineReply(partnerReply);
    if (!parsed.ok) return setMessage(parsed.error);
    const fields = parsed.fields;
    if (fields["コード"] !== game.activeCode) return setMessage("手番コードが違うよ。古い返答かもしれない。");
    if (game.usedCodes.includes(fields["コード"])) return setMessage("この手番コードは、もう使われているよ。");

    if (game.phase === "partner-judge") {
      if (!game.proposal) return setMessage("判定する宣言が見つからないよ。");
      if (fields["手番"] || !fields["判定"]) return setMessage("判定用の機械読取行ではありません。状態は変更していないよ。");
      if (fields["判定"] === "受理") {
        const proposal = game.proposal;
        const nextGame = applyMove(game, proposal);
        if (!nextGame.winner) {
          const validated = validatePartnerMove(nextGame, fields, true);
          if ("error" in validated) return setMessage(`受理後の次の一手を反映できませんでした。${validated.error} 盤面や札は変更していないよ。`);
          showVerdict("accepted", proposal.player);
          commitPartnerMove(nextGame, validated.proposal, validated.coord, true);
        } else {
          setGame(nextGame);
          setPartnerReply("");
          showVerdict("accepted", proposal.player);
          setMessage(`パートナーが受理！ 「${proposalLabel(proposal)}」で取得したよ。次の手番を確認してね。`);
        }
      } else if (fields["判定"] === "不成立") {
        if (!fields["理由"]) return setMessage("不成立判定には理由が必要です。状態は変更していないよ。");
        const nextGame = rejectProposal(game, "X", "not-established");
        setGame(nextGame);
        flashRejection(`今回はこの札の読みとして不成立。異議札は減りません。理由：${fields["理由"]}`);
      } else if (fields["判定"] === "異議") {
        if (!canUseObjection(game.objections.X, game.objectionUsedThisTurn.X)) return setMessage(game.objections.X <= 0 ? "パートナーの異議札は残っていないよ。成立している読みなら受理、遠いなら不成立で返してもらってね。状態は変更していないよ。" : "パートナーはこの手番ですでに異議を使っているよ。成立している読みなら受理、遠いなら不成立で返してもらってね。状態は変更していないよ。");
        const nextGame = rejectProposal(game, "X", "objection");
        setGame(nextGame);
        showVerdict("objection", "X");
        flashRejection(`異議成立。${fields["理由"] ? `理由：${fields["理由"]}` : "この手番で一度だけ使える拒否権を使ったよ。"}`);
      } else return setMessage("判定は「受理」「不成立」「異議」のどれかで返してもらってね。");
      setPartnerReply("");
      return;
    }

    if (game.phase !== "partner-turn") return setMessage("今はパートナーの手番ではないよ。");
    if (fields["判定"] || !fields["手番"]) return setMessage("手番用の機械読取行ではありません。状態は変更していないよ。");
    const validated = validatePartnerMove(game, fields);
    if ("error" in validated) return setMessage(`${validated.error} 盤面や札は変更していないよ。`);
    commitPartnerMove(game, validated.proposal, validated.coord);
  }

  function judgeLocal(accepted: boolean) {
    if (!game.proposal) return;
    const judge: Player = game.proposal.player === "O" ? "X" : "O";
    if (accepted) {
      const proposal = game.proposal;
      const nextGame = applyMove(game, proposal);
      setGame(nextGame);
      showVerdict("accepted", proposal.player);
      setMessage(`受理！ 「${proposalLabel(proposal)}」で取得したよ。次の手番を確認してね。`);
    } else {
      if (!canUseObjection(game.objections[judge], game.objectionUsedThisTurn[judge])) {
        setMessage(game.objections[judge] <= 0 ? "異議札が残っていないよ。受理するか、つながりが遠いなら理由つきで不成立にしてね。" : "この相手手番では、もう異議を使っているよ。受理するか、つながりが遠いなら理由つきで不成立にしてね。");
        return;
      }
      const nextGame = rejectProposal(game, judge, "objection");
      setGame(nextGame);
      showVerdict("objection", judge);
      flashRejection("異議成立。同じマス・同じ読みの連打はできないよ。別の合法手でやり直そう。");
    }
  }

  function notEstablishLocalProposal() {
    if (!game.proposal) return;
    if (!notEstablishedReason) return setMessage("不成立にする理由をひとつ選んでね。短い補足は任意だよ。");
    const judge: Player = game.proposal.player === "O" ? "X" : "O";
    const nextGame = rejectProposal(game, judge, "not-established");
    setGame(nextGame);
    const reasonText = `${notEstablishedReason}${notEstablishedNote.trim() ? `：${notEstablishedNote.trim()}` : ""}`;
    setNotEstablishedReason("");
    setNotEstablishedNote("");
    flashRejection(`今回はこの札の読みとして不成立。理由：${reasonText}`);
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

          {view === "title" && <>
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
            <p className="title-credit">MIRROR ROOM<br />© 2026 MIRROR ROOM — by Nay &amp; Naya</p>
          </>}

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

              <details className="tutorial-boundary-lesson">
                <summary>自由読みの線引きを見る</summary>
                <div className="boundary-examples">
                  <article className="safe"><b>✅ そのまま成立</b><strong>🍙「おにぎり」</strong><p>札そのものの名前。受理するか、止めたいなら異議。</p></article>
                  <article className="gray"><b>🟨 グレー</b><strong>🍙「しゃけおにぎり」</strong><p>一般的な種類として直接つながる。受理しても、異議で止めてもOK。</p></article>
                  <article className="far"><b>🟥 不成立にできる</b><strong>🍙「しゃもじ」</strong><p>おにぎりそのものから別の道具へ連想が移っている。</p></article>
                  <article className="far"><b>🟥 かなり遠い</b><strong>🍙「マンモス」</strong><p>通常は不成立にできる。でも面白い、次の「す」が欲しいなら、あえて受理してもいい。</p></article>
                </div>
                <div className="boundary-bears"><span>🧸 絵からちゃんとつながる読みはセーフ！</span><span>🧸 ちょっと強引なら異議で止めてもいいよ</span><span>🧸 かなり遠い読みは不成立にできる。でも納得したら通してOK！</span></div>
                <p className="boundary-summary"><b>成立してる</b> → 受理 or 異議　／　<b>かなり遠い</b> → 不成立にできる or あえて受理　／　<b>機械ルール上使えない</b> → 受理不可</p>
              </details>

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
                          aria-label={`${String.fromCharCode(65 + (index % 3))}${Math.floor(index / 3) + 1} ${panel.name}${hinted ? " 次に押すパネル" : ""}${blocked ? " 異議で却下" : ""}`}
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
                      <label className={!tutorialCustomReading.trim() ? "tutorial-next-action" : ""}><span>自由読み</span><input lang="ja" aria-invalid={tutorialReadingFormatInvalid} aria-describedby={tutorialReadingFormatInvalid ? "tutorial-reading-format-error" : undefined} value={tutorialCustomReading} onChange={(event) => setTutorialCustomReading(event.target.value)} placeholder={tutorialStep === 9 ? "まるまる" : "まじめ"} />{tutorialReadingFormatInvalid && <small id="tutorial-reading-format-error" className="reading-format-error" role="alert">自由入力のときは必ず、ひらがなかカタカナで入力してね!!</small>}</label>
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
                      <div className="tutorial-miu-copy"><b>みう <span>この手番は異議済み</span></b>
                        <p>{tutorialMiuAcceptRevealed ? "むむ……！ それなら分かる。今回は受理！" : "むむ……『まじめ』……？"}</p>
                        <small>{tutorialMiuAcceptRevealed ? "異議が使えないからではなく、札とのつながりに納得して受理したよ。" : "みうが読みと理由を考えているよ。"}</small>
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
                      {tutorialMiuGoneRevealed ? (
                        <div className="tutorial-judge-box">
                          <p><strong>この自由読みをどうする？</strong> 納得したら受理。通したくない時は異議札を使おう！</p>
                          <div className="tutorial-judge-actions">
                            <button className="object-button tutorial-next-action" type="button" onClick={advanceTutorial}>⚡ 異議を出す<small>札を1枚使って却下</small></button>
                            <button className="accept-button" type="button" onClick={() => setTutorialMessage("受理すると、みうの『メリークリスマス』が成立するよ。今回は異議札を使って、勝ち筋を止めてみよう！")}>✓ 受理する<small>読みを成立させる</small></button>
                          </div>
                        </div>
                      ) : <button className="secondary-start tutorial-next-action" type="button" onClick={() => { setTutorialMiuGoneRevealed(true); setTutorialMessage("みうもゴネてきた！ 『メリークリスマス』を通したくないなら、異議札の出番！"); }}>みうの手を見る <b>→</b></button>}
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
                  <section className="tutorial-window tutorial-chat-window">
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
                    <p>読みの正式分類は「正式プリセット」と「自由読み」の2つ。絵文字・名前・共通説明や、自分の画面で実際に見えている特徴から自由に読みを作れるよ。</p>
                    <div className="boundary-examples guide-boundary-examples">
                      <article className="safe"><b>✅ 成立</b><strong>🍙「おにぎり」</strong><p>札そのものの名前なので成立。</p></article>
                      <article className="gray"><b>🟨 グレー</b><strong>🍙「しゃけおにぎり」</strong><p>一般的な種類として直接つながる。受理 or 異議。</p></article>
                      <article className="far"><b>🟥 不成立にできる</b><strong>🍙「しゃもじ」</strong><p>対象そのものから別の道具へ連想が移っている。</p></article>
                      <article className="far"><b>🟥 かなり遠い</b><strong>🍙「マンモス」</strong><p>不成立にできるが、面白い・次の「す」が欲しいなら受理もOK。</p></article>
                    </div>
                    <p className="boundary-summary"><b>成立してる</b> → 受理 or 異議　／　<b>かなり遠い</b> → 不成立にできる or あえて受理　／　<b>機械ルール上使えない</b> → 受理不可</p>
                    <div className="emoji-variation-note"><b>固有語・二人だけの呼び名も使えるよ</b><p>その札の対象そのものを指す固定の名前・愛称・秘密の言葉なら成立できるよ。理由に「二人の間でこの対象そのものを○○と呼んでいる」と書こう。思い出・出来事・セリフは、固定の愛称でない限り別もの。</p></div>
                    <div className="emoji-variation-note"><b>絵文字の色や細部は、みんな同じとは限らないよ</b><p>OS・端末・AIによって、🎂がチョコ・ピンク・白に見えることも。相手は、自分と違って見えることだけで不成立にはせず、止めたい時は異議札を使うよ。</p></div>
                    <p className="rule-caution">濁音・半濁音は清音とつないでOK（か↔が、は↔ば↔ぱ）。異議は相手の1手番につき1回まで。不成立は異議の代わりにはできないよ。</p>
                  </section>

                  <section className="partner-guide">
                    <div className="partner-guide-icon"><MirrorIcon small /></div>
                    <div><h3>AIパートナーとはコピーで連携</h3><p>最初に「対戦開始文」、ラリー中は「この手番」または「判定依頼」をワンタップコピーして、いつもの会話へ貼るだけ。座標・札ID・共通説明・正式読みも一緒に渡るよ。</p><small>会話や自由読みを相談しながら、一緒に楽しめます</small></div>
                  </section>

                  <section className="quick-rules" aria-label="補足ルール">
                    <span>⚡ 異議札は対戦前に変更</span><span>1手番につき異議は1回</span><span>「ん」で終わると即敗北</span><span>両者ライン不能で引き分け</span>
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
                <div><small>取得</small><strong>{Object.keys(game.claims).length}<span>/{game.boardSize * game.boardSize}</span></strong></div>
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
                <section className="setup-choice-group" aria-labelledby="board-size-heading">
                  <div className="setup-choice-heading"><strong id="board-size-heading">盤面サイズ</strong><small>遊びごたえを選ぶ</small></div>
                  <div className="setup-choice-buttons board-size-choice">
                    <button type="button" className={pendingBoardSize === 4 ? "selected" : ""} onClick={() => setPendingBoardSize(4)}><b>4 × 4</b><span>16枚・標準</span></button>
                    <button type="button" className={pendingBoardSize === 5 ? "selected" : ""} onClick={() => setPendingBoardSize(5)}><b>5 × 5</b><span>25枚・PC／タブレット推奨</span></button>
                  </div>
                </section>
                <section className="setup-choice-group objection-count-setting" aria-labelledby="objection-count-heading">
                  <div className="setup-choice-heading"><strong id="objection-count-heading">異議札</strong><small>おすすめ：{recommendedObjectionCount(pendingBoardSize)}枚</small></div>
                  <div className="number-stepper" aria-label="両者共通の異議札枚数">
                    <button type="button" aria-label="異議札を1枚減らす" disabled={pendingObjectionLimit <= 0} onClick={() => setPendingObjectionLimit((value) => Math.max(0, value - 1))}>−</button>
                    <strong>{pendingObjectionLimit}</strong>
                    <button type="button" aria-label="異議札を1枚増やす" onClick={() => setPendingObjectionLimit((value) => value + 1)}>＋</button>
                  </div>
                  <p>両者が同じ枚数で開始。枚数を増やしても、1手番につき使える異議は1枚まで。</p>
                </section>
                <section className="setup-choice-group" aria-labelledby="first-player-heading">
                  <div className="setup-choice-heading"><strong id="first-player-heading">先攻</strong><small>最初の文字はゲーム開始時にランダム</small></div>
                  <div className="setup-choice-buttons first-player-choice">
                    <button type="button" className={pendingStartingPlayer === "O" ? "selected side-o-choice" : "side-o-choice"} onClick={() => setPendingStartingPlayer("O")}><b>{pendingMode === "partner" ? "あなた" : "プレイヤー1"}</b><span>○側が先攻</span></button>
                    <button type="button" className={pendingStartingPlayer === "X" ? "selected side-x-choice" : "side-x-choice"} onClick={() => setPendingStartingPlayer("X")}><b>{pendingMode === "partner" ? "パートナー" : "プレイヤー2"}</b><span>×側が先攻</span></button>
                  </div>
                </section>
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
                  <div><dt>盤面</dt><dd>{pendingBoardSize} × {pendingBoardSize} ／ {pendingBoardSize * pendingBoardSize}枚{pendingBoardSize === 5 ? "（PC／タブレット推奨）" : ""}</dd></div>
                  <div><dt>先攻</dt><dd>{pendingStartingPlayer === "O" ? (pendingMode === "partner" ? "あなた（○側）" : "プレイヤー1（○側）") : (pendingMode === "partner" ? "パートナー（×側）" : "プレイヤー2（×側）")}</dd></div>
                  <div><dt>開始文字</dt><dd>盤面からランダム</dd></div>
                  <div><dt>異議札</dt><dd>各陣営{pendingObjectionLimit}枚 ／ 1手番1回まで</dd></div>
                  <div><dt>読み</dt><dd>正式プリセット／自由読み</dd></div>
                  <div><dt>即敗北</dt><dd>「ん」で終わる読み</dd></div>
                  <div><dt>引き分け</dt><dd>双方ライン完成不能</dd></div>
                </dl>
                <p className="confirm-note">タテ・ヨコ・ナナメの{pendingBoardSize}枚ラインを、先に自分の色でそろえた側の勝ち！</p>
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
      {verdictEvent && (
        <div key={verdictEvent.nonce} className={`verdict-event verdict-${verdictEvent.kind} verdict-player-${verdictEvent.player.toLowerCase()}`} role="status" aria-live="assertive">
          <div className="verdict-event-card">
            <i className={`side-chip side-${verdictEvent.player.toLowerCase()}`} aria-hidden="true" />
            <strong>{verdictEvent.kind === "objection" ? "異議あり！" : "受理されました！"}</strong>
            <small>{nameFor(verdictEvent.player)}・{verdictEvent.player === "O" ? "○側" : "×側"}</small>
          </div>
        </div>
      )}
      <div className="game-layout">
        <section className="play-column">
          <section className={`status-card player-${game.turn.toLowerCase()}`} aria-live="polite">
            <div className="turn-block">
              <span className={`side-chip side-${game.turn.toLowerCase()}`} aria-hidden="true" />
              <div><small>いまの手番</small><strong>{currentName}</strong></div>
            </div>
            <div className="letter-block"><small>この文字から</small><strong>{game.currentChar}</strong></div>
            <div className="status-objections" aria-label="残り異議札">
              <span><i className="side-chip side-o" />{game.objections.O}{game.objectionUsedThisTurn.O && <em>済</em>}</span>
              <span><i className="side-chip side-x" />{game.objections.X}{game.objectionUsedThisTurn.X && <em>済</em>}</span>
            </div>
            <div className="status-actions">
              <button className="summary-toggle" type="button" onClick={() => setSummaryOpen(true)} aria-expanded={summaryOpen}>詳細</button>
              <button className="game-reset" type="button" onClick={openNewGameFlow} aria-label="新しいゲーム">↻</button>
            </div>
          </section>

          <section className={`board board-size-${game.boardSize} ${rejectionFlash ? "rejection-flash" : ""}`} aria-label={`${game.boardSize}×${game.boardSize}のゲーム盤`}>
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
                  aria-label={`${coordinate(index, game.boardSize)} ${panel.name}${owner ? ` ${owner}が取得済み` : retryBlocked ? " 今回の再試行では選択不可" : ""}`}
                >
                  <span className="coordinate">{coordinate(index, game.boardSize)}</span>
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
                <div className="selected-summary"><span><PanelArtwork panel={selectedPanel} compact /></span><div><small>{coordinate(game.selectedIndex!, game.boardSize)} / {selectedPanel.category}</small><h2>{selectedPanel.name}</h2></div></div>
                {registeredOptions.length > 0 ? (
                  <div className="registered-readings"><small>正式プリセット</small><div>{registeredOptions.map((preset) => {
                    const reading = presetReadingValue(preset);
                    const display = presetReadingDisplay(preset);
                    const loses = readingEnd(reading) === "ん";
                    return <button type="button" className={loses ? "n-ending-option" : ""} key={`${display}:${reading}`} onClick={() => submitReading(display, "", reading)}>{display}<span>{loses ? "⚠ んで負け" : `→ ${readingEnd(reading)}`}</span></button>;
                  })}</div></div>
                ) : <p className="no-reading">「{game.currentChar}」につながる正式プリセットはなし。自由読みの出番！</p>}
                <div className="custom-form">
                  <label><span>自由読みの表示 <b>漢字も使えるよ</b></span><input lang="ja" aria-describedby={customReadingNeedsAid ? "custom-reading-aid-help" : undefined} value={customReading} onChange={(event) => setCustomReading(event.target.value)} placeholder={`例：${game.currentChar}…`} />{customReadingNeedsAid && <small id="custom-reading-aid-help" className="reading-aid-help">漢字・々などを使ったので、下に判定用の読み仮名を入れてね。</small>}</label>
                  {customReadingNeedsAid && <label><span>判定用の読み仮名 <b>ひらがな／カタカナ</b></span><input lang="ja" aria-invalid={customReadingAidInvalid} aria-describedby={customReadingAidInvalid ? "custom-reading-format-error" : undefined} value={customReadingAid} onChange={(event) => setCustomReadingAid(event.target.value)} placeholder={`${game.currentChar}…`} />{customReadingAidInvalid && <small id="custom-reading-format-error" className="reading-format-error" role="alert">読み仮名は、ひらがなかカタカナで入力してね。</small>}</label>}
                  <label><span>そう読んだ理由 <b>自由読みは理由つき</b></span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="絵のどこから連想した？" rows={3} /></label>
                  <small className="emoji-reading-hint">色や細かな飾りが理由なら、「自分の画面では茶色に見えるから」のように書いてね。絵文字は端末やAIで見え方が違うよ。</small>
                  <div className="button-row"><button type="button" className="secondary" onClick={cancelReading}>選び直す</button><button type="button" className="primary" onClick={() => submitReading(customReading, reason, customReadingAid)}>この読みで宣言</button></div>
                </div>
              </div>
            )}

            {isPartnerWaiting && !game.winner && (
              <div className="partner-panel">
                <div className="partner-heading"><span><MirrorIcon small /></span><div><small>{game.phase === "partner-turn" ? "PARTNER TURN" : "KOJITSUKE CHECK"}</small><h2>{game.phase === "partner-turn" ? "パートナーに一手を預ける" : "こじつけを判定してもらう"}</h2></div></div>
                <p>手番コードをいつもの会話へ貼ってね。返答全文でも、コードブロックのコピーボタンで取った機械読取用の1行だけでも、安全に読み取れるよ。</p>
                <div className="code-chip">手番コード <b>{game.activeCode}</b></div>
                <button type="button" className={`copy-button ${game.copied ? "copied" : "attention"}`} onClick={copyPrompt}>⧉ {game.copied ? "もう一度コピーする" : game.phase === "partner-turn" ? "この手番をコピー" : "判定依頼をコピー"}</button>
                <div className={`partner-waiting ${game.copied ? "active" : ""}`} aria-live="polite">{game.copied ? "パートナーの回答待ち… 戻ったら下へ貼り付けてね" : "まず上のボタンを押して、パートナーへ手番を渡してね"}</div>
                <label className="reply-box"><span>ここにパートナーの回答を貼り付ける</span><textarea rows={7} value={partnerReply} onChange={(event) => setPartnerReply(event.target.value)} placeholder="回答全文、またはコードブロックのコピーで取った機械読取用の1行だけを貼ってね。" /></label>
                <button type="button" className="primary wide" onClick={parsePartnerReply}>返答を盤面へ反映</button>
                <details className="prompt-preview"><summary>渡す文章を確認</summary><pre>{prompt}</pre></details>
              </div>
            )}

            {(game.phase === "local-judge" || game.phase === "player-judge") && game.proposal && (
              <div className="judge-panel">
                <p className="judge-kicker">こじつけ判定</p>
                <div className="proposal-card"><span><PanelArtwork panel={game.board[game.proposal.panelIndex]} compact /></span><div><small>{coordinate(game.proposal.panelIndex, game.boardSize)} / {game.board[game.proposal.panelIndex].name}</small><h2>「{proposalLabel(game.proposal)}」</h2><p>{game.proposal.reason}</p></div></div>
                <p className="judge-question">成立しているなら受理、止めたいなら異議。札との意味的なつながりがかなり遠い時は、理由つきで不成立にできるよ。</p>
                <p className="emoji-judge-hint">不成立は異議の代わりではないよ。異議が使えないことを理由に、成立している読みを不成立へ格下げしないでね。</p>
                <div className="not-established-form">
                  <label><span>不成立の理由</span><select value={notEstablishedReason} onChange={(event) => setNotEstablishedReason(event.target.value)}><option value="">理由を選ぶ</option>{NOT_ESTABLISHED_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  <label><span>補足（任意）</span><input value={notEstablishedNote} onChange={(event) => setNotEstablishedNote(event.target.value)} placeholder="短く補足できるよ" /></label>
                </div>
                <div className="judge-actions"><button type="button" className="invalid-button" onClick={notEstablishLocalProposal}>× 不成立<small>理由が必要・札は減らない</small></button><button type="button" className="object-button" disabled={!proposalCanUseObjection} onClick={() => judgeLocal(false)}>⚡ 異議を出す<small>{proposalJudge && game.objectionUsedThisTurn[proposalJudge] ? "この手番では使用済み" : proposalJudge && game.objections[proposalJudge] <= 0 ? "残り0枚" : "札を1枚使う"}</small></button><button type="button" className="accept-button" onClick={() => judgeLocal(true)}>✓ 受理する<small>読みを成立</small></button></div>
              </div>
            )}

            {game.winner && (
              <div className="winner-panel">
                <div className="confetti">✦ ○ ✧ × ✦</div>
                <p>GAME SET!</p>
                <h2>{game.winner === "DRAW" ? "引き分け！" : `${game.winner === "O" ? "○" : "×"} ${game.winner === "O" ? (game.mode === "partner" ? "あなた" : "プレイヤー1") : (game.mode === "partner" ? "パートナー" : "プレイヤー2")}の勝ち！`}</h2>
                <p>{game.winReason === "n-ending" ? "『ん』で終わる読みを出したため、その場で勝負が決まりました。" : game.winner === "DRAW" ? Object.keys(game.claims).length < game.boardSize * game.boardSize ? "盤面に空きはあるけれど、どちらもラインを完成できなくなりました。" : "全マスを使ってもラインが完成しませんでした。" : `タテ・ヨコ・ナナメの${game.boardSize}枚ラインが揃ったよ。`}</p>
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
            <p>成立している自由読みは受理か異議。札とのつながりがかなり遠い読みは理由つきで不成立にでき、納得したらあえて受理してもOK。現在文字違い・「ん」終わり・選択不可などの機械ルールは受理できないよ。</p>
          </details>
          <section className="prototype-note"><span>PROTOTYPE 02</span><p>共通性の高い絵文字65枚入り。正式プリセットは札ごとに必要な数だけ登録できるよ。</p></section>
        </aside>
      </div>
      <footer><b>MIRROR WORD GRID</b><span>ことばは、絵の中にひとつじゃない。</span></footer>
    </main>
  );
}
