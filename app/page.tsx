"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type Player = "O" | "X";
type Mode = "partner" | "local";
type Difficulty = "easy" | "normal" | "hard";
type View = "loading" | "title" | "tutorial" | "guide" | "resume" | "mode" | "confirm" | "countdown" | "game";
type Phase =
  | "select"
  | "reading"
  | "partner-turn"
  | "partner-judge"
  | "local-judge"
  | "player-judge";

type Panel = {
  id: string;
  icon: string;
  visualDescription?: string;
  name: string;
  category: string;
  readings: string[];
};

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
  timeLeft: number;
  timerRunning: boolean;
  copied: boolean;
  proposal: Proposal | null;
  winner: Player | "DRAW" | null;
  winningLine: number[];
  history: HistoryItem[];
  mode: Mode;
  difficulty: Difficulty;
  retryBlocked: number[];
  seed: number;
};

type TurnNotice = {
  eyebrow: string;
  title: string;
  body: string;
  action: string;
  startTimer: boolean;
};

const PANELS: Panel[] = [
  { id: "frog-prince", icon: "🐸", name: "かえる", category: "動物", readings: ["かえる", "あまがえる", "りょうせいるい", "いきもの"], visualDescription: "正面を向いた緑色のかえるの顔" },
  { id: "box-cat", icon: "🐱", name: "ねこ", category: "動物", readings: ["ねこ", "こねこ", "にゃんこ", "どうぶつ"], visualDescription: "ひげと三角の耳がある猫の顔" },
  { id: "flying-fish", icon: "🐟", name: "さかな", category: "動物", readings: ["さかな", "うお", "ぎょるい", "いきもの"], visualDescription: "横向きに泳ぐ青い魚" },
  { id: "moon-coffee", icon: "☕", name: "コーヒー", category: "飲み物", readings: ["コーヒー", "カップ", "のみもの", "きっさてん"], visualDescription: "湯気が立つ白いカップの温かい飲み物" },
  { id: "gift-ghost", icon: "👻", name: "おばけ", category: "空想", readings: ["おばけ", "ゆうれい", "ゴースト", "ようかい"], visualDescription: "白く浮かび舌を出した幽霊" },
  { id: "melt-clock", icon: "⏰", name: "目覚まし時計", category: "日用品", readings: ["とけい", "めざまし", "アラーム", "じかん"], visualDescription: "上にベルが二つ付いた赤い目覚まし時計" },
  { id: "umbrella", icon: "☂️", name: "かさ", category: "日用品", readings: ["かさ", "あまがさ", "こうもりがさ", "あまぐ"], visualDescription: "持ち手が曲がった開いた傘" },
  { id: "cake", icon: "🍰", name: "ケーキ", category: "食べ物", readings: ["ケーキ", "ショートケーキ", "おかし", "デザート"], visualDescription: "クリームと苺がのった三角形のケーキ" },
  { id: "bus", icon: "🚌", name: "バス", category: "乗り物", readings: ["バス", "ろせんバス", "のりもの", "じどうしゃ"], visualDescription: "正面を向いた黄色い路線バス" },
  { id: "apple", icon: "🍎", name: "りんご", category: "食べ物", readings: ["りんご", "アップル", "くだもの", "あかいみ"], visualDescription: "葉が一枚付いた赤いりんご" },
  { id: "eggplant", icon: "🍆", name: "なす", category: "食べ物", readings: ["なす", "なすび", "やさい", "むらさき"], visualDescription: "緑のへたが付いた紫色のなす" },
  { id: "watermelon", icon: "🍉", name: "すいか", category: "食べ物", readings: ["すいか", "くだもの", "フルーツ", "なつのくだもの"], visualDescription: "黒い種が見える三角形のすいか" },
  { id: "ruby", icon: "💎", name: "宝石", category: "物", readings: ["ほうせき", "ダイヤ", "ジュエル", "たからもの"], visualDescription: "青く輝くカットされた宝石" },
  { id: "dog", icon: "🐶", name: "いぬ", category: "動物", readings: ["いぬ", "こいぬ", "わんこ", "どうぶつ"], visualDescription: "たれ耳で正面を向いた犬の顔" },
  { id: "plush", icon: "🐻", name: "くま", category: "動物", readings: ["くま", "こぐま", "ベア", "どうぶつ"], visualDescription: "丸い耳を持つ茶色い熊の顔" },
  { id: "mirror", icon: "🔍", name: "虫眼鏡", category: "道具", readings: ["むしめがね", "ルーペ", "レンズ", "かくだいきょう"], visualDescription: "丸いレンズに持ち手が付いた虫眼鏡" },
  { id: "storm", icon: "⚡", name: "かみなり", category: "自然", readings: ["かみなり", "いなずま", "らいめい", "でんき"], visualDescription: "黄色く折れ曲がった稲妻" },
  { id: "deer", icon: "🦌", name: "しか", category: "動物", readings: ["しか", "こじか", "どうぶつ", "つの"], visualDescription: "枝分かれした角を持つ鹿" },
  { id: "key", icon: "🔑", name: "かぎ", category: "日用品", readings: ["かぎ", "キー", "あいかぎ", "かいじょう"], visualDescription: "輪の付いた金色の鍵" },
  { id: "mushroom", icon: "🍄", name: "きのこ", category: "食べ物", readings: ["きのこ", "しいたけ", "マッシュルーム", "くさびら"], visualDescription: "赤い傘に白い点があるきのこ" },
  { id: "top", icon: "🌀", name: "うずまき", category: "記号", readings: ["うず", "うずまき", "ぐるぐる", "かいてん"], visualDescription: "青い線が中心へ巻き込む渦巻き" },
  { id: "pillow", icon: "💤", name: "ねむり", category: "記号", readings: ["ねむり", "すいみん", "ひるね", "ねむい"], visualDescription: "眠っていることを表す青いZの記号" },
  { id: "radio", icon: "📻", name: "ラジオ", category: "家電", readings: ["ラジオ", "ほうそう", "おんせい", "じゅしんき"], visualDescription: "アンテナとつまみが付いたラジオ" },
  { id: "crown", icon: "👑", name: "王冠", category: "装飾品", readings: ["かんむり", "おうかん", "クラウン", "おうさま"], visualDescription: "宝石が付いた金色の王冠" },
  { id: "moon", icon: "🌙", name: "月", category: "自然", readings: ["つき", "みかづき", "おつきさま", "よぞら"], visualDescription: "黄色い細い三日月" },
  { id: "bird", icon: "🐦", name: "とり", category: "動物", readings: ["とり", "ことり", "バード", "どうぶつ"], visualDescription: "横向きに立つ青い小鳥" },
  { id: "shoe", icon: "👟", name: "スニーカー", category: "衣類", readings: ["くつ", "スニーカー", "うんどうぐつ", "はきもの"], visualDescription: "ひもが付いた運動靴" },
  { id: "book", icon: "📕", name: "本", category: "日用品", readings: ["ほん", "えほん", "しょせき", "ブック"], visualDescription: "閉じた赤い表紙の本" },
  { id: "candle", icon: "🕯️", name: "ろうそく", category: "日用品", readings: ["ろうそく", "キャンドル", "あかり", "ひかり"], visualDescription: "火が灯った白いろうそく" },
  { id: "bread", icon: "🍞", name: "食パン", category: "食べ物", readings: ["パン", "しょくぱん", "ブレッド", "たべもの"], visualDescription: "切れ目のない一斤の食パン" },
  { id: "star-bottle", icon: "⭐", name: "星", category: "自然", readings: ["ほし", "スター", "ほしぞら", "きらきら"], visualDescription: "黄色い五つ角の星" },
  { id: "bubble", icon: "💧", name: "しずく", category: "自然", readings: ["しずく", "みず", "すいてき", "なみだ"], visualDescription: "先が尖った青い水滴" },
  { id: "elephant", icon: "🐘", name: "ぞう", category: "動物", readings: ["ぞう", "エレファント", "どうぶつ", "おおきなどうぶつ"], visualDescription: "長い鼻と大きな耳を持つ象" },
  { id: "robot", icon: "🤖", name: "ロボット", category: "機械", readings: ["ロボット", "きかい", "じんぞうにんげん", "メカ"], visualDescription: "四角い頭にアンテナが付いたロボットの顔" },
  { id: "dragon", icon: "🐉", name: "りゅう", category: "空想", readings: ["りゅう", "ドラゴン", "たつ", "かいじゅう"], visualDescription: "緑色で長い体をくねらせる東洋の竜" },
  { id: "sunflower", icon: "🌻", name: "ひまわり", category: "植物", readings: ["ひまわり", "はな", "きいろいはな", "しょくぶつ"], visualDescription: "茶色い中心と黄色い花びらのひまわり" },
  { id: "snowman", icon: "⛄", name: "雪だるま", category: "自然", readings: ["ゆきだるま", "スノーマン", "ゆき", "ふゆ"], visualDescription: "丸い雪玉を二つ重ねた雪だるま" },
  { id: "teapot", icon: "🍵", name: "お茶", category: "飲み物", readings: ["おちゃ", "にほんちゃ", "りょくちゃ", "のみもの"], visualDescription: "緑茶が入った湯のみ茶碗" },
  { id: "rainbow", icon: "🌈", name: "虹", category: "自然", readings: ["にじ", "レインボー", "なないろ", "そら"], visualDescription: "赤から紫まで七色の弧を描く虹" },
  { id: "rocket", icon: "🚀", name: "ロケット", category: "乗り物", readings: ["ロケット", "うちゅうせん", "のりもの", "うちゅう"], visualDescription: "炎を噴いて斜め上へ飛ぶロケット" },
  { id: "hat", icon: "🎩", name: "シルクハット", category: "衣類", readings: ["ぼうし", "シルクハット", "ハット", "かぶりもの"], visualDescription: "黒くて背の高いシルクハット" },
  { id: "camera", icon: "📷", name: "カメラ", category: "道具", readings: ["カメラ", "しゃしんき", "さつえい", "レンズ"], visualDescription: "正面に丸いレンズがあるカメラ" },
  { id: "pencil", icon: "✏️", name: "えんぴつ", category: "文房具", readings: ["えんぴつ", "ペンシル", "ぶんぼうぐ", "かくどうぐ"], visualDescription: "先を削った黄色い鉛筆" },
  { id: "cloud-castle", icon: "🏰", name: "城", category: "建物", readings: ["しろ", "おしろ", "じょうさい", "キャッスル"], visualDescription: "塔と旗がある石造りの城" },
  { id: "jellyfish", icon: "🐙", name: "たこ", category: "動物", readings: ["たこ", "オクトパス", "うみのいきもの", "なんたいどうぶつ"], visualDescription: "八本の足を広げた赤いたこ" },
  { id: "fox-mask", icon: "🦊", name: "きつね", category: "動物", readings: ["きつね", "こぎつね", "フォックス", "どうぶつ"], visualDescription: "尖った耳を持つ橙色のきつねの顔" },
  { id: "lantern", icon: "🏮", name: "ちょうちん", category: "日用品", readings: ["ちょうちん", "あかちょうちん", "あかり", "ランタン"], visualDescription: "黒い枠が付いた赤い紙の提灯" },
  { id: "tree-door", icon: "🚪", name: "ドア", category: "建物", readings: ["ドア", "とびら", "いりぐち", "もん"], visualDescription: "取っ手が付いた閉じた木の扉" },
];

const SPINES = [
  { start: "か", ids: ["umbrella", "flying-fish", "eggplant", "watermelon", "frog-prince", "ruby", "dog", "plush", "mirror", "storm"] },
  { start: "ね", ids: ["box-cat", "moon-coffee", "cake", "mushroom", "top", "pillow", "radio", "crown", "mirror", "moon"] },
  { start: "つ", ids: ["moon", "mushroom", "top", "pillow", "radio", "crown", "mirror", "frog-prince", "ruby", "dog"] },
];

const WIN_LINES = [
  [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
  [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
  [0, 5, 10, 15], [3, 6, 9, 12],
];

const STORAGE_KEY = "mirror-word-grid-prototype-v1";
const TIME_LIMITS: Record<Difficulty, number | null> = { easy: null, normal: 60, hard: 30 };
const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "EASY", normal: "NORMAL", hard: "HARD" };
const TUTORIAL_PANELS = [
  { id: "umbrella", icon: "☂️", name: "かさ", reading: "かさ" },
  { id: "flying-fish", icon: "🐟", name: "さかな", reading: "さかな" },
  { id: "eggplant", icon: "🍆", name: "なす", reading: "なす" },
  { id: "cake", icon: "🍰", name: "ケーキ", reading: "ケーキ" },
  { id: "apple", icon: "🍎", name: "りんご", reading: "りんご" },
  { id: "box-cat", icon: "🐱", name: "ねこ", reading: "ねこ" },
  { id: "bus", icon: "🚌", name: "バス", reading: "バス" },
  { id: "plush", icon: "🐻", name: "くま", reading: "くま" },
  { id: "moon", icon: "🌙", name: "月", reading: "つき" },
] as const;
const SMALL_KANA: Record<string, string> = { "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お", "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "っ": "つ", "ゎ": "わ" };
const CLEAR_KANA: Record<string, string> = {
  "が": "か", "ぎ": "き", "ぐ": "く", "げ": "け", "ご": "こ",
  "ざ": "さ", "じ": "し", "ず": "す", "ぜ": "せ", "ぞ": "そ",
  "だ": "た", "ぢ": "ち", "づ": "つ", "で": "て", "ど": "と",
  "ば": "は", "び": "ひ", "ぶ": "ふ", "べ": "へ", "ぼ": "ほ",
  "ぱ": "は", "ぴ": "ひ", "ぷ": "ふ", "ぺ": "へ", "ぽ": "ほ",
  "ゔ": "う",
};
const VOWEL_GROUPS: Record<string, string> = {
  あ: "あかがさざただなはばぱまやらわ", い: "いきぎしじちぢにひびぴみり", う: "うくぐすずつづぬふぶぷむゆる", え: "えけげせぜてでねへべぺめれ", お: "おこごそぞとどのほぼぽもよろを",
};

function normalizeReading(value: string) {
  return value
    .trim()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s　・!！?？。、,.]/g, "")
    .toLowerCase();
}

function readingStart(value: string) {
  return SMALL_KANA[normalizeReading(value)[0]] ?? normalizeReading(value)[0] ?? "";
}

function clearKana(value: string) {
  return CLEAR_KANA[value] ?? value;
}

function readingStartsWith(value: string, currentChar: string) {
  return clearKana(readingStart(value)) === clearKana(currentChar);
}

function readingEnd(value: string) {
  const normalized = normalizeReading(value);
  if (!normalized) return "";
  const last = normalized.at(-1) ?? "";
  if (last !== "ー") return SMALL_KANA[last] ?? last;
  const before = normalized.at(-2) ?? "";
  for (const [vowel, chars] of Object.entries(VOWEL_GROUPS)) {
    if (chars.includes(before)) return vowel;
  }
  return before;
}

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

function turnSeconds(difficulty: Difficulty) {
  return TIME_LIMITS[difficulty] ?? 0;
}

function createGame(seed = 407, mode: Mode = "partner", difficulty: Difficulty = "normal", timerRunning = false): GameState {
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
    timeLeft: turnSeconds(difficulty),
    timerRunning: timerRunning && difficulty !== "easy",
    copied: false,
    proposal: null,
    winner: null,
    winningLine: [],
    history: [],
    mode,
    difficulty,
    retryBlocked: [],
    seed,
  };
}

function coordinate(index: number) {
  return `${String.fromCharCode(65 + (index % 4))}${Math.floor(index / 4) + 1}`;
}

function panelVisualDescription(panel: Panel) {
  return panel.visualDescription ?? `${panel.name}として描かれた${panel.category}のイラスト`;
}

function findWinner(claims: Record<number, Player>) {
  for (const line of WIN_LINES) {
    const owner = claims[line[0]];
    if (owner && line.every((index) => claims[index] === owner)) return { winner: owner, line };
  }
  if (Object.keys(claims).length === 16) return { winner: "DRAW" as const, line: [] };
  return { winner: null, line: [] };
}

function isRegistered(panel: Panel, reading: string) {
  const normalized = normalizeReading(reading);
  return panel.readings.some((item) => normalizeReading(item) === normalized);
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
    timeLeft: turnSeconds(state.difficulty),
    timerRunning: false,
    copied: false,
    proposal: null,
    winner: result.winner,
    winningLine: result.line,
    history: [...state.history, { player: proposal.player, coordinate: coordinate(proposal.panelIndex), reading: proposal.reading }],
    retryBlocked: [],
  };
}

function rejectProposal(state: GameState, judge: Player, spendObjection = true): GameState {
  const proposer = state.proposal?.player ?? state.turn;
  const rejectedIndex = state.proposal?.panelIndex;
  const retryPhase = state.mode === "partner" && proposer === "X" ? "partner-turn" : "select";
  return {
    ...state,
    turn: proposer,
    phase: retryPhase,
    selectedIndex: null,
    objections: spendObjection ? { ...state.objections, [judge]: Math.max(0, state.objections[judge] - 1) } : state.objections,
    activeCode: freshCode(),
    usedCodes: [...state.usedCodes, state.activeCode].slice(-30),
    timeLeft: turnSeconds(state.difficulty),
    timerRunning: false,
    copied: false,
    proposal: null,
    retryBlocked: rejectedIndex === undefined ? state.retryBlocked : [...new Set([...state.retryBlocked, rejectedIndex])],
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
    return `${coordinate(index)}｜絵文字:${panel.icon}｜ID:${panel.id}｜名前:${panel.name}｜カテゴリ:${panel.category}｜見た目:${panelVisualDescription(panel)}｜プリセット読み:${panel.readings.join("・")}${blocked}`;
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
  const nearWins = WIN_LINES.filter((line) => {
    const owned = line.filter((index) => claims[index] === proposal.player).length;
    const empty = line.filter((index) => !claims[index]).length;
    return owned === 3 && empty === 1;
  }).map((line) => coordinate(line.find((index) => !claims[index])!));
  return nearWins.length ? `受理すると${proposal.player}側がリーチ（次の勝利候補:${nearWins.join("・")}）` : "受理しても直ちにリーチ・勝利にはならない";
}

function partnerTurnPrompt(game: GameState) {
  const choices = game.board.map((_, index) => index).filter((index) => !game.claims[index] && !game.retryBlocked.includes(index)).map(coordinate).join("、");
  return `# MIRROR WORD GRID：パートナーの手番\n\nあなたは×側です。あなた自身の解釈と性格で、勝つための一手を選んでください。\n\n手番コード：${game.activeCode}\n現在の文字：「${game.currentChar}」\n残り異議札：○ ${game.objections.O}枚／× ${game.objections.X}枚\n選択可能：${choices}\n戦況：${lineThreats(game.claims)}\n\n## 盤面\n${boardSummary(game)}\n\n## 読みの優先順位\n1. プリセット読み：理由なしで成立する基本ルート\n2. 自由読み：絵文字・名前・見た目から一段階で追える読み。理由が必要\n3. ゴねり：連想を二段階以上重ねるイレギュラー読み。宣言はできるが異議対象になりやすい\n\n## ルール\n- 空きマスを一つ選び、「${game.currentChar}」から始まる読みを宣言する\n- 語頭の濁音・半濁音は清音とつなげてよい（例：か↔が、は↔ば↔ぱ）\n- 「ん」で終わる読みは使えない\n- 自由読みとゴねりには、絵からそう読んだ理由を書く\n- 直前に異議を受けた選択不可マスは選ばない\n- ○のラインを遮断する、自分のラインを伸ばすなど戦況を必ず考える\n- 説明は自由\n\n## 返答形式\n- PCからコピーしやすいよう、返答全体をMarkdownのコードブロック1つに入れる\n- コードブロックの外には何も書かない\n- 最後の一行は、次の形式をそのまま使う\n\n【手番:A1｜読み:かさ｜理由:傘の絵文字をそのまま読んだ｜コード:${game.activeCode}】`;
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

  return `# MIRROR WORD GRID：こじつけ判定＋次の一手\n\nあなたは×側です。○側の自由読みを、納得感と勝ちたい気持ちの両方で裁いてください。読みとして自然でも、通すと相手が有利になるなら異議札を使って止めてかまいません。\n\n手番コード：${game.activeCode}\nマス：${coordinate(proposal.panelIndex)}\n絵文字：${panel.icon}\n札ID：${panel.id}\n名前：${panel.name}\n見た目：${panelVisualDescription(panel)}\nプリセット読み：${panel.readings.join("・")}\n宣言した読み：${proposal.reading}\n理由：${proposal.reason}\n現在の文字：${game.currentChar}\n残り異議札：○ ${game.objections.O}枚／× ${game.objections.X}枚\n戦況：${lineThreats(game.claims)}\nこの手の影響：${acceptanceImpact(game, proposal)}\n\n## 判定の分け方\n1. 明確なルール違反は「無効」。異議札を消費しない\n2. 絵文字・名前・見た目から一段階で追える自由読みは「受理」しやすい\n3. 連想を二段階以上重ねる読みは「ゴねり」。グレーなゴねり、または戦略上どうしても止めたい手は「異議」。×の異議札を1枚使う\n\n語頭の濁音・半濁音は清音と同じつながりとして扱う（例：か↔が、は↔ば↔ぱ）。\n自由読みは、次の3項目のうち2つ以上を満たすほど受理しやすい：\n- 絵文字に直接見える特徴がある\n- 対象と一般的に強く結びつく特徴・用途・状態である\n- その札を特定できる対象名や固有の要素を含む\n「かわいい」「うまそう」など多くの札に使える主観だけでは弱い。\n\n## 受理する場合\n${continuation}\n\n## 返答形式\n- PCからコピーしやすいよう、返答全体をMarkdownのコードブロック1つに入れる\n- コードブロックの外には何も書かない\n- 最後の一行は次のどれか一つを、そのまま使う\n\n${acceptedFormat}\n【判定:無効｜理由:絵文字との関連がほぼない｜コード:${game.activeCode}】\n【判定:異議｜理由:ゴねりが強い、または戦略上ここは取らせたくない｜コード:${game.activeCode}】`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
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

function NavigatorPair({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`navigator-pair ${compact ? "compact" : ""}`} aria-label="しゅとみうのナビゲーター">
      <span className="css-bear bear-shu" aria-label="しゅ">
        <i className="bear-ear left" /><i className="bear-ear right" />
        <i className="bear-face"><b className="bear-eye left" /><b className="bear-eye right" /><b className="bear-muzzle" /></i>
        <i className="bear-body" />
      </span>
      <span className="css-bear bear-miu" aria-label="みう">
        <i className="bear-ear left" /><i className="bear-ear right" />
        <i className="bear-face"><b className="bear-eye left" /><b className="bear-eye right" /><b className="bear-muzzle" /></i>
        <i className="bear-body" />
      </span>
    </div>
  );
}

export default function Home() {
  const [game, setGame] = useState<GameState>(() => createGame());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("loading");
  const [pendingMode, setPendingMode] = useState<Mode>("partner");
  const [pendingDifficulty, setPendingDifficulty] = useState<Difficulty>("normal");
  const [countdown, setCountdown] = useState(3);
  const [resumeAfterCountdown, setResumeAfterCountdown] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [rejectionFlash, setRejectionFlash] = useState(false);
  const [customReading, setCustomReading] = useState("");
  const [reason, setReason] = useState("");
  const [partnerReply, setPartnerReply] = useState("");
  const [message, setMessage] = useState("絵文字を選んで、しりとりを始めよう！");
  const [turnNotice, setTurnNotice] = useState<TurnNotice | null>(null);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialMessage, setTutorialMessage] = useState("「か」から始まる絵文字を選んでみよう！");

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const restored = JSON.parse(saved) as GameState;
          const difficulty = restored.difficulty ?? "normal";
          const board = restored.board.map((savedPanel) => PANELS.find((panel) => panel.id === savedPanel.id) ?? savedPanel);
          const migrated = { ...restored, board, difficulty, retryBlocked: restored.retryBlocked ?? [], timerRunning: false, copied: false };
          const hasProgress = migrated.history.length > 0 || Object.keys(migrated.claims).length > 0 || migrated.phase !== "select";
          setGame(migrated);
          setPendingMode(migrated.mode);
          setPendingDifficulty(difficulty);
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
    if (view !== "countdown") return;
    if (countdown <= 0) {
      const kickoff = window.setTimeout(() => {
        if (resumeAfterCountdown) {
          setGame((current) => ({
            ...current,
            timeLeft: turnSeconds(current.difficulty),
            timerRunning: !current.winner && current.difficulty !== "easy" && !(current.mode === "partner" && current.turn === "X") && current.phase === "select",
          }));
        } else {
          setGame(createGame(Date.now(), pendingMode, pendingDifficulty, true));
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
  }, [view, countdown, pendingMode, pendingDifficulty, resumeAfterCountdown]);

  useEffect(() => {
    if (view !== "game" || !game.timerRunning || game.winner) return;
    const timer = window.setInterval(() => {
      setGame((current) => {
        if (!current.timerRunning || current.winner) return current;
        if (current.timeLeft > 1) return { ...current, timeLeft: current.timeLeft - 1 };
        const skipped: Player = current.turn;
        const next: Player = skipped === "O" ? "X" : "O";
        const skippedName = skipped === "O" ? (current.mode === "partner" ? "あなた" : "プレイヤー1") : (current.mode === "partner" ? "パートナー" : "プレイヤー2");
        const nextName = next === "O" ? (current.mode === "partner" ? "あなた" : "プレイヤー1") : (current.mode === "partner" ? "パートナー" : "プレイヤー2");
        setMessage(`${skippedName}側、時間切れです。${nextName}側へ手番が渡ります。`);
        setTurnNotice({
          eyebrow: "TIME UP",
          title: `${skippedName}側、時間切れです`,
          body: `${nextName}側へ手番が渡ります。盤面を確認してから始めてね。`,
          action: next === "X" && current.mode === "partner" ? "パートナーへ渡す画面を見る" : `${nextName}の手番を始める`,
          startTimer: !(next === "X" && current.mode === "partner"),
        });
        return {
          ...current,
          turn: next,
          phase: nextPhase(current.mode, next),
          selectedIndex: null,
          proposal: null,
          activeCode: freshCode(),
          usedCodes: [...current.usedCodes, current.activeCode].slice(-30),
          timeLeft: turnSeconds(current.difficulty),
          timerRunning: false,
          copied: false,
          retryBlocked: [],
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [game.timerRunning, game.winner, view]);

  const selectedPanel = game.selectedIndex === null ? null : game.board[game.selectedIndex];
  const registeredOptions = useMemo(() => {
    if (!selectedPanel) return [];
    return selectedPanel.readings.filter((reading) => readingStartsWith(reading, game.currentChar) && readingEnd(reading) !== "ん");
  }, [selectedPanel, game.currentChar]);

  const prompt = game.phase === "partner-judge" && game.proposal ? partnerJudgePrompt(game) : partnerTurnPrompt(game);
  const isPartnerWaiting = game.phase === "partner-turn" || game.phase === "partner-judge";
  const currentName = game.turn === "O" ? (game.mode === "partner" ? "あなた" : "プレイヤー1") : (game.mode === "partner" ? "パートナー" : "プレイヤー2");

  function nameFor(player: Player, mode = game.mode) {
    return player === "O" ? (mode === "partner" ? "あなた" : "プレイヤー1") : (mode === "partner" ? "パートナー" : "プレイヤー2");
  }

  function announceNext(nextGame: GameState, eyebrow: string, title: string, body: string) {
    if (nextGame.winner) return;
    const partnerTurn = nextGame.mode === "partner" && nextGame.turn === "X";
    setTurnNotice({
      eyebrow,
      title,
      body,
      action: partnerTurn ? "パートナーへ渡す画面を見る" : `${nameFor(nextGame.turn, nextGame.mode)}の手番を始める`,
      startTimer: !partnerTurn,
    });
  }

  function continueAfterNotice() {
    if (!turnNotice) return;
    setGame((current) => ({
      ...current,
      timerRunning: turnNotice.startTimer && current.difficulty !== "easy" && !current.winner,
      timeLeft: turnSeconds(current.difficulty),
    }));
    setTurnNotice(null);
  }

  function openNewGameFlow() {
    setGame((current) => ({ ...current, timerRunning: false }));
    setPendingMode(game.mode);
    setPendingDifficulty(game.difficulty);
    setTurnNotice(null);
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
    setTutorialMessage("この中から「か」から始まるものを探して、絵文字を押してみてね。");
    setView("tutorial");
  }

  function selectTutorialPanel(id: string) {
    if (tutorialStep === 0) {
      if (id !== "umbrella") {
        setTutorialMessage("いまは「か」からだよ。絵文字の名前だけじゃなく、別の呼び方も探してみてね。");
        return;
      }
      setTutorialStep(1);
      setTutorialMessage("大正解！ この傘は「かさ」と読めるね。読みを宣言してみよう。");
      return;
    }
    if (tutorialStep === 3) {
      if (id !== "eggplant") {
        setTutorialMessage("しゅ＆みうの「さかな」で、次は「な」から。この中から探してみてね。");
        return;
      }
      setTutorialStep(4);
      setTutorialMessage("見つけた！ 「なす」を宣言すれば、しりとりがつながるよ。");
    }
  }

  function advanceTutorial() {
    if (tutorialStep === 1) {
      setTutorialStep(2);
      setTutorialMessage("「かさ」で左上をGET！ 最後の「さ」が、しゅ＆みうへ渡るよ。");
      return;
    }
    if (tutorialStep === 2) {
      setTutorialStep(3);
      setTutorialMessage("しゅ＆みうは「さかな」で上の真ん中をGET！ 次は「な」から選んでね。");
      return;
    }
    if (tutorialStep === 4) {
      setTutorialStep(5);
      setTutorialMessage("「なす」でGET！ こんなふうに言葉と陣地をつないで、一列そろえたら勝ちだよ！");
    }
  }

  function flashRejection(text: string) {
    setMessage(text);
    setRejectionFlash(true);
    window.setTimeout(() => setRejectionFlash(false), 900);
  }

  function selectPanel(index: number) {
    if (game.winner || game.phase !== "select" || game.claims[index] || game.retryBlocked.includes(index)) return;
    setGame({ ...game, selectedIndex: index, phase: "reading", timerRunning: false });
    setCustomReading("");
    setReason("");
    setMessage(`${coordinate(index)}「${game.board[index].name}」をどう読む？ 入力中は時計を止めてあるよ。`);
  }

  function submitReading(reading: string, explanation: string) {
    if (game.selectedIndex === null || !selectedPanel) return;
    const normalized = normalizeReading(reading);
    if (normalized.length < 2) return setMessage("読みは2文字以上で入れてね。");
    if (!readingStartsWith(reading, game.currentChar)) return setMessage(`「${game.currentChar}」から始まる読みだけ使えるよ。濁音・半濁音は清音とつないでOK！`);
    if (readingEnd(reading) === "ん") return setMessage("「ん」で終わる読みは、初期版では使えないよ。");
    const registered = isRegistered(selectedPanel, reading);
    if (!registered && !explanation.trim()) return setMessage("自由読みには、絵文字からそう読んだ理由も必要だよ。");

    const proposal: Proposal = {
      player: game.turn,
      panelIndex: game.selectedIndex,
      reading: reading.trim(),
      reason: registered ? "プリセット読み" : explanation.trim(),
      custom: !registered,
    };

    if (registered) {
      const nextGame = applyMove(game, proposal);
      setGame(nextGame);
      setMessage(`「${proposal.reading}」で${coordinate(proposal.panelIndex)}を取得！ 次は「${readingEnd(proposal.reading)}」。`);
      announceNext(nextGame, "TURN CHANGE", `${nameFor(proposal.player)}の読みが成立！`, `次は「${readingEnd(proposal.reading)}」から。${nameFor(nextGame.turn)}側へ手番が渡ります。`);
    } else if (game.mode === "partner") {
      setGame({ ...game, proposal, phase: "partner-judge", selectedIndex: null, timerRunning: false, copied: false });
      setMessage("自由読みだね。時計を止めたよ。手番コードをコピーして、パートナーへ判定を渡そう。");
    } else {
      setGame({ ...game, proposal, phase: "local-judge", selectedIndex: null, timerRunning: false });
      setMessage("相手は、このこじつけを受理する？");
    }
  }

  function cancelReading() {
    setGame({ ...game, selectedIndex: null, phase: "select", timeLeft: turnSeconds(game.difficulty), timerRunning: game.difficulty !== "easy" });
    setMessage("別の絵文字を選び直せるよ。");
  }

  async function copyPrompt() {
    const copied = await copyToClipboard(prompt);
    if (!copied) return setMessage("コピーできなかったよ。文章を長押ししてコピーしてね。");
    setGame({ ...game, timerRunning: false, copied: true });
    setMessage("パートナーの回答待ち。戻ってきたら、下の大きな欄へ回答を貼ってね。");
  }

  function resolvePartnerMove(baseGame: GameState, fields: Record<string, string>, combined = false) {
    const coord = (combined ? fields["次手"] : fields["手番"])?.toUpperCase();
    const match = coord?.match(/^([A-D])([1-4])$/);
    const retryPartnerTurn = (text: string) => {
      if (combined) {
        setGame(baseGame);
        setPartnerReply("");
        setMessage(`こじつけの受理は反映したよ。${text} 次の手番コードをコピーして、パートナーの一手だけ受け取ろう。`);
        announceNext(baseGame, "ACCEPTED", "こじつけは受理！", `${text} パートナーの次の一手だけ、もう一度受け取ってね。`);
        return;
      }
      setGame({
        ...baseGame,
        activeCode: freshCode(),
        usedCodes: [...baseGame.usedCodes, baseGame.activeCode].slice(-30),
        copied: false,
        timerRunning: false,
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
    if (readingEnd(reading) === "ん") return retryPartnerTurn("「ん」で終わる読みは使えません。");
    const custom = !isRegistered(baseGame.board[index], reading);
    const proposal: Proposal = { player: "X", panelIndex: index, reading, reason: fields["理由"] ?? "", custom };
    if (custom && !proposal.reason) return retryPartnerTurn("自由読みなのに理由がありません。");

    if (custom) {
      setGame({ ...baseGame, proposal, phase: "player-judge", timerRunning: false, copied: false });
      setMessage(combined
        ? "受理と次の一手をまとめて反映！ パートナーの自由読みを、あなたが判定する番だよ。"
        : "パートナーの自由読み。あなたが受理するか決める番だよ。");
    } else {
      const nextGame = applyMove(baseGame, proposal);
      setGame(nextGame);
      setMessage(`パートナーが「${reading}」で${coord}を取得。次の手番を確認してね。`);
      announceNext(nextGame, combined ? "DOUBLE RESPONSE" : "TURN CHANGE", combined ? "受理＋次の一手、反映！" : "パートナーの手が成立！", `${coord}を「${reading}」で取得。次は「${readingEnd(reading)}」から、あなたの手番です。`);
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
          announceNext(nextGame, "ACCEPTED", "こじつけ、受理！", `「${proposal.reading}」で${coordinate(proposal.panelIndex)}を取得。次は「${readingEnd(proposal.reading)}」から。`);
        }
      } else if (fields["判定"] === "無効") {
        const nextGame = rejectProposal(game, "X", false);
        setGame(nextGame);
        flashRejection(`ルール違反で無効。異議札は減りません。理由：${fields["理由"] || "絵文字との関連が確認できない"}`);
        announceNext(nextGame, "INVALID", "この読みは無効です", `異議札は減りません。${coordinate(game.proposal.panelIndex)}以外の絵で、もう一度読みを作ってね。`);
      } else if (fields["判定"] === "異議") {
        if (game.objections.X <= 0) {
          const proposal = game.proposal;
          const nextGame = applyMove(game, proposal);
          setGame(nextGame);
          setMessage("パートナーの異議札はゼロ。グレー判定のため、今回は自動で受理したよ。");
          announceNext(nextGame, "AUTO ACCEPT", "異議札がないため受理！", `「${proposal.reading}」で${coordinate(proposal.panelIndex)}を取得。次は「${readingEnd(proposal.reading)}」から。`);
        } else {
          const nextGame = rejectProposal(game, "X");
          setGame(nextGame);
          flashRejection(`異議成立。理由：${fields["理由"] || "今回は通さないと判断"}`);
          announceNext(nextGame, "OBJECTION", "パートナーの異議！", `${coordinate(game.proposal.panelIndex)}は今回の再試行では選べません。別の絵でやり直してね。`);
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
      announceNext(nextGame, "ACCEPTED", "こじつけ、受理！", `${coordinate(proposal.panelIndex)}を「${proposal.reading}」で取得。次は「${readingEnd(proposal.reading)}」から。`);
    } else {
      if (game.objections[judge] <= 0) {
        const proposal = game.proposal;
        const nextGame = applyMove(game, proposal);
        setGame(nextGame);
        setMessage("異議札が残っていないため、グレー判定は自動で受理したよ。");
        announceNext(nextGame, "AUTO ACCEPT", "異議札がないため受理！", `${coordinate(proposal.panelIndex)}を「${proposal.reading}」で取得。次は「${readingEnd(proposal.reading)}」から。`);
        return;
      }
      const nextGame = rejectProposal(game, judge);
      setGame(nextGame);
      flashRejection("異議成立。宣言した側は別の絵でやり直そう。");
      announceNext(nextGame, "OBJECTION", "異議が成立！", `${coordinate(game.proposal.panelIndex)}は今回の再試行では選べません。別の絵文字を選んでね。`);
    }
  }

  function invalidateLocalProposal() {
    if (!game.proposal) return;
    const judge: Player = game.proposal.player === "O" ? "X" : "O";
    const nextGame = rejectProposal(game, judge, false);
    setGame(nextGame);
    flashRejection("明確なルール違反として無効。異議札は減りません。");
    announceNext(nextGame, "INVALID", "この読みは無効です", `${coordinate(game.proposal.panelIndex)}は今回の再試行では選べません。別の絵でやり直してね。`);
  }

  const brand = (
    <div className="start-brand">
      <Image className="start-brand-image" src="/mirror-word-grid-logo.png" alt="MIRROR WORD GRID — AI PARTNER × WORD GAME" width={835} height={483} priority />
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
                <div><p className="step-label">TRY IT WITH SHU &amp; MIU</p><h2>しゅ＆みうと練習！</h2></div>
                <div className="guide-heading-tools"><NavigatorPair compact /><button className="back-button" type="button" onClick={() => setView("title")}>← 戻る</button></div>
              </header>

              <div className="tutorial-layout">
                <section className="tutorial-game" aria-label="練習用の盤面">
                  <div className="tutorial-status">
                    <div><small>いまの文字</small><strong>{tutorialStep < 2 ? "か" : tutorialStep < 3 ? "さ" : "な"}</strong></div>
                    <div><small>いまの手番</small><strong>{tutorialStep === 2 ? "しゅ＆みう" : "あなた"}</strong></div>
                    <div><small>目標</small><strong>3枚を一列</strong></div>
                  </div>
                  <div className="tutorial-board">
                    {TUTORIAL_PANELS.map((panel) => {
                      const claimedByYou = (panel.id === "umbrella" && tutorialStep >= 2) || (panel.id === "eggplant" && tutorialStep >= 5);
                      const claimedByBears = panel.id === "flying-fish" && tutorialStep >= 3;
                      const selected = (panel.id === "umbrella" && tutorialStep === 1) || (panel.id === "eggplant" && tutorialStep === 4);
                      return (
                        <button
                          key={panel.id}
                          type="button"
                          className={`tutorial-tile ${selected ? "selected" : ""} ${claimedByYou ? "claimed-o" : ""} ${claimedByBears ? "claimed-x" : ""}`}
                          onClick={() => selectTutorialPanel(panel.id)}
                          disabled={tutorialStep === 1 || tutorialStep === 2 || tutorialStep === 4 || tutorialStep >= 5}
                        >
                          <span aria-hidden="true">{panel.icon}</span>
                          <small>{panel.name}</small>
                          {(claimedByYou || claimedByBears) && <i className={`tutorial-claim ${claimedByYou ? "side-o" : "side-x"}`} />}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <aside className="tutorial-coach" aria-live="polite">
                  <div className="tutorial-progress" aria-label={`全5段階中${Math.min(tutorialStep + 1, 5)}段階目`}>
                    {[0, 1, 2, 3, 4].map((step) => <i key={step} className={tutorialStep >= step ? "done" : ""} />)}
                  </div>
                  <span className="guide-tag">{tutorialStep >= 5 ? "PRACTICE CLEAR!" : `STEP ${Math.min(tutorialStep + 1, 5)} / 5`}</span>
                  <h3>{tutorialStep === 0 ? "「か」から始まるものを探そう" : tutorialStep === 1 ? "読みを宣言しよう" : tutorialStep === 2 ? "相手へ手番が渡るよ" : tutorialStep === 3 ? "今度は「な」から探そう" : tutorialStep === 4 ? "もう一度、読みを宣言！" : "練習クリア！"}</h3>
                  <p>{tutorialMessage}</p>

                  {tutorialStep === 1 && <button className="start-button" type="button" onClick={advanceTutorial}>「かさ」と読む <b>→</b></button>}
                  {tutorialStep === 2 && <button className="start-button bears-turn-button" type="button" onClick={advanceTutorial}>しゅ＆みうの手を見る <b>→</b></button>}
                  {tutorialStep === 4 && <button className="start-button" type="button" onClick={advanceTutorial}>「なす」と読む <b>→</b></button>}
                  {tutorialStep === 5 && (
                    <div className="tutorial-finish-actions">
                      <button className="start-button" type="button" onClick={() => setView("mode")}>本番で遊ぶ <b>→</b></button>
                      <button className="secondary-start" type="button" onClick={() => setView("guide")}>こじつけ・異議も見る</button>
                    </div>
                  )}
                  <button className="text-button" type="button" onClick={() => setView("title")}>タイトルへ戻る</button>
                </aside>
              </div>
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
                    <div><strong>しりとり × 陣取り</strong><p>16枚の絵文字を交互に取り、タテ・ヨコ・ナナメのどれか一列を先に自分の色でそろえたら勝ち！</p></div>
                  </section>

                  <ol className="rule-steps">
                    <li><b>1</b><div><strong>今の文字を確認</strong><p>画面上の「この文字から」で、使う読みの最初の文字が決まるよ。</p></div></li>
                    <li><b>2</b><div><strong>絵文字を選び、読みを宣言</strong><p>プリセット読みはそのまま成立。絵文字から一段階で追える自由読みには、理由も添えてね。</p></div></li>
                    <li><b>3</b><div><strong>最後の文字をつなぐ</strong><p>成立した読みの最後の文字が、次の手番の開始文字になるよ。「ん」で終わる読みは使えない。</p></div></li>
                    <li><b>4</b><div><strong>自分のラインを作る</strong><p>取ったマスには陣営色のチップがつくよ。相手がそろえそうなマスを先に取って妨害してもOK！</p></div></li>
                  </ol>
                </div>

                <div className="guide-column">
                  <section className="kojitsuke-guide">
                    <span className="guide-tag">このゲームの醍醐味</span>
                    <h3>見た目は一枚、読み方はたくさん！</h3>
                    <p>まずはプリセット読み。絵文字・名前・見た目から一段階で追える自由読みも使えるよ。連想を二段階以上重ねるイレギュラー読みは「ゴねり」扱いで、異議を出されやすくなる！</p>
                    <div className="example-reading"><span className="example-art">☂️</span><div><small>例：「り」から始めたい</small><strong>「りょこう」</strong><p>旅行へ持っていく傘だから！</p></div></div>
                    <p className="rule-caution">濁音・半濁音は清音とつないでOK（か↔が、は↔ば↔ぱ）。「うまそう」「かわいい」だけのように、どの札にも使える主観や強いゴねりは異議対象になりやすいよ。</p>
                  </section>

                  <section className="partner-guide">
                    <div className="partner-guide-icon"><MirrorIcon small /></div>
                    <div><h3>AIパートナーとはコピーで連携</h3><p>「手番コードをコピー」で盤面情報をコピーし、いつもの会話へ貼るだけ。各札は座標・札ID・見た目の説明で共有されるから、本番イラストになっても同じ札を迷わず選べるよ。</p><small>AIとの往復中は時計停止／回答反映後も「手番を始める」まで動きません</small></div>
                  </section>

                  <section className="quick-rules" aria-label="補足ルール">
                    <span>⚡ 異議札は各3枚</span><span>⏱ EASYは時間無制限</span><span>✎ 読み・理由の入力中は停止</span><span>● ◆ 色とチップで陣営表示</span>
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
                <h2>だれと遊ぶ？</h2>
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
                <h2>試合設定</h2>
                <p>まずはEASYでも大丈夫。こじつけ理由を考えている間は、どの難易度でも時計が止まるよ。</p>
              </div>
              <div className="setup-panel">
                <div className="difficulty-picker" aria-label="難易度">
                  {(["easy", "normal", "hard"] as Difficulty[]).map((difficulty) => (
                    <button key={difficulty} type="button" className={pendingDifficulty === difficulty ? "selected" : ""} onClick={() => setPendingDifficulty(difficulty)}>
                      <strong>{DIFFICULTY_LABELS[difficulty]}</strong>
                      <small>{difficulty === "easy" ? "時間無制限" : difficulty === "normal" ? "選択 60秒" : "選択 30秒"}</small>
                    </button>
                  ))}
                </div>
                <dl className="settings-list">
                  <div><dt>モード</dt><dd>{pendingMode === "partner" ? "AIパートナー受け渡し" : "人間ふたり対戦"}</dd></div>
                  <div><dt>盤面</dt><dd>4 × 4 ／ 16枚</dd></div>
                  <div><dt>難易度</dt><dd>{DIFFICULTY_LABELS[pendingDifficulty]}</dd></div>
                  <div><dt>制限時間</dt><dd>{pendingDifficulty === "easy" ? "時間無制限" : `絵の選択 ${turnSeconds(pendingDifficulty)}秒`}／入力中は停止</dd></div>
                  <div><dt>異議札</dt><dd>各陣営3枚</dd></div>
                </dl>
                <p className="confirm-note">「ゲームを始める」を押したあと、3秒カウントで時計が動き出すよ。</p>
                <button className="start-button" type="button" onClick={() => beginCountdown(false)}>ゲームを始める <b>→</b></button>
                <button className="text-button" type="button" onClick={() => setView("mode")}>モードを選び直す</button>
              </div>
            </div>
          )}

          {view === "countdown" && (
            <div className="countdown-screen" aria-live="assertive">
              <small>{resumeAfterCountdown ? "READY TO RESUME" : "READY?"}</small>
              <strong>{countdown > 0 ? countdown : "GO!"}</strong>
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
            <div className={`timer ${!game.timerRunning ? "paused" : ""}`}>
              <small>{game.difficulty === "easy" ? "時間無制限" : game.timerRunning ? "札を選ぶ" : "時計停止"}</small>
              <strong>{game.difficulty === "easy" ? "∞" : game.timerRunning ? `${game.timeLeft}` : "Ⅱ"}</strong>
              <span>{game.difficulty === "easy" ? "EASY" : game.timerRunning ? "秒" : "PAUSE"}</span>
            </div>
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
                  disabled={Boolean(owner) || retryBlocked || game.phase !== "select" || Boolean(game.winner)}
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
            {game.phase === "select" && !game.winner && (
              <div className="empty-action">
                <div className="finger">☝️</div>
                <div><h2>絵文字をひとつ選ぶ</h2><p>プリセットがなくても、一段階で読めそうなら選んでOK。</p></div>
              </div>
            )}

            {game.phase === "reading" && selectedPanel && (
              <div className="reading-panel">
                <div className="selected-summary"><span><PanelArtwork panel={selectedPanel} compact /></span><div><small>{coordinate(game.selectedIndex!)} / {selectedPanel.category}</small><h2>{selectedPanel.name}</h2></div></div>
                {registeredOptions.length > 0 ? (
                  <div className="registered-readings"><small>プリセット読み</small><div>{registeredOptions.map((reading) => <button type="button" key={reading} onClick={() => submitReading(reading, "")}>{reading}<span>→ {readingEnd(reading)}</span></button>)}</div></div>
                ) : <p className="no-reading">「{game.currentChar}」につながるプリセットはなし。自由読みの出番！</p>}
                <div className="custom-form">
                  <label><span>自由な読み <b>「{game.currentChar}」から</b></span><input value={customReading} onChange={(event) => setCustomReading(event.target.value)} placeholder={`${game.currentChar}…`} /></label>
                  <label><span>そう読んだ理由 <b>入力中は時計停止</b></span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="絵のどこから連想した？" rows={3} /></label>
                  <div className="button-row"><button type="button" className="secondary" onClick={cancelReading}>選び直す</button><button type="button" className="primary" onClick={() => submitReading(customReading, reason)}>この読みで宣言</button></div>
                </div>
              </div>
            )}

            {isPartnerWaiting && !game.winner && (
              <div className="partner-panel">
                <div className="partner-heading"><span><MirrorIcon small /></span><div><small>{game.phase === "partner-turn" ? "PARTNER TURN" : "KOJITSUKE CHECK"}</small><h2>{game.phase === "partner-turn" ? "パートナーに一手を預ける" : "こじつけを判定してもらう"}</h2></div></div>
                <p>時計は停止中。手番コードをいつもの会話へ貼り、パートナーの回答を最終行ごと戻してね。</p>
                <div className="code-chip">手番コード <b>{game.activeCode}</b></div>
                <button type="button" className={`copy-button ${game.copied ? "copied" : "attention"}`} onClick={copyPrompt}>⧉ {game.copied ? "もう一度コピーする" : "手番コードをコピー"}</button>
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
                <p>{game.winner === "DRAW" ? "盤面がぜんぶ埋まったよ。" : "タテ・ヨコ・ナナメの一列が揃ったよ。"}</p>
                <button type="button" className="primary" onClick={openNewGameFlow}>もう一局あそぶ</button>
              </div>
            )}
          </section>
        </section>

      </div>

      {turnNotice && (
        <div className="turn-notice" role="dialog" aria-modal="true" aria-live="assertive" aria-label={turnNotice.title}>
          <div className="turn-notice-card">
            <NavigatorPair compact />
            <span>{turnNotice.eyebrow}</span>
            <h2>{turnNotice.title}</h2>
            <p>{turnNotice.body}</p>
            <button type="button" className="start-button" onClick={continueAfterNotice}>{turnNotice.action} <b>→</b></button>
          </div>
        </div>
      )}

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
          <section className="history-card">
            <div className="section-title"><span>PLAY LOG</span><h2>ことばの足あと</h2></div>
            {game.history.length ? <ol>{[...game.history].reverse().slice(0, 12).map((item, index) => <li key={`${item.coordinate}-${index}`}><i className={`side-chip side-${item.player.toLowerCase()}`} /><span>{item.coordinate}</span><strong>{item.reading}</strong></li>)}</ol> : <p className="muted">最初の一手を待ってるよ。</p>}
          </section>
          <details className="rules-card">
            <summary><span>HOW TO PLAY</span><strong>あそびかた</strong><b>＋</b></summary>
            <ol><li><b>1</b><span>今の文字から読める絵文字を選ぶ</span></li><li><b>2</b><span>プリセット、または理由つきの自由読みを宣言</span></li><li><b>3</b><span>二段階以上のゴねりは異議対象になりやすい</span></li><li><b>4</b><span>最後の文字を次の手番へつなぐ</span></li><li><b>5</b><span>先に自分の色を一列そろえたら勝ち</span></li></ol>
            <p>濁音・半濁音は清音と接続可能。明確な違反は異議札なしで無効、グレー判定や戦略的な反対は異議札を1枚使うよ。AIとの往復・読みと理由の入力中は時計停止。</p>
          </details>
          <section className="prototype-note"><span>PROTOTYPE 02</span><p>共通性の高い絵文字48枚入り。各札にプリセット読みを4つ用意しているよ。</p></section>
        </aside>
      </div>
      <footer><b>MIRROR WORD GRID</b><span>ことばは、絵の中にひとつじゃない。</span></footer>
    </main>
  );
}
