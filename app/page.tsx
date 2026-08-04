"use client";

import { useEffect, useMemo, useState } from "react";

type Player = "O" | "X";
type Mode = "partner" | "local";
type View = "loading" | "title" | "resume" | "mode" | "confirm" | "countdown" | "game";
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
  seed: number;
};

const PANELS: Panel[] = [
  { id: "frog-prince", icon: "🐸👑", name: "王冠ガエル", category: "怪異", readings: ["かえる", "おうじ", "とのさま", "みどりのかえる"] },
  { id: "box-cat", icon: "🐈📦", name: "箱入り猫", category: "動物", readings: ["ねこ", "こねこ", "はこねこ", "はこのなか"] },
  { id: "flying-fish", icon: "🐟☁️", name: "空飛ぶ魚", category: "不思議", readings: ["さかな", "とびうお", "そらをとぶさかな"] },
  { id: "moon-coffee", icon: "☕🌙", name: "月のコーヒー", category: "不思議", readings: ["コーヒー", "つき", "のみもの", "よるのカップ"] },
  { id: "gift-ghost", icon: "👻🎁", name: "贈りもの幽霊", category: "怪異", readings: ["ゆうれい", "おばけ", "ゴースト", "ぷれぜんと"] },
  { id: "melt-clock", icon: "🫠⏰", name: "溶けた時計", category: "不思議", readings: ["とけい", "とけたとけい", "じかん"] },
  { id: "umbrella", icon: "☂️💧", name: "雨の傘", category: "日用品", readings: ["かさ", "あまがさ", "あめ"] },
  { id: "cake", icon: "🍰🍓", name: "苺ケーキ", category: "食べ物", readings: ["ケーキ", "おかし", "いちごケーキ"] },
  { id: "bus", icon: "🚌✨", name: "黄色いバス", category: "日用品", readings: ["バス", "のりもの", "きいろいバス"] },
  { id: "apple", icon: "🍎✨", name: "赤いりんご", category: "食べ物", readings: ["りんご", "くだもの", "あかいみ"] },
  { id: "eggplant", icon: "🍆🌿", name: "なす", category: "食べ物", readings: ["なす", "やさい", "むらさき"] },
  { id: "watermelon", icon: "🍉💦", name: "すいか", category: "食べ物", readings: ["すいか", "くだもの", "しまもよう"] },
  { id: "ruby", icon: "💎❤️", name: "赤いルビー", category: "不思議", readings: ["ルビー", "ほうせき", "あかいほうせき"] },
  { id: "dog", icon: "🐕✨", name: "元気な犬", category: "動物", readings: ["いぬ", "こいぬ", "どうぶつ"] },
  { id: "plush", icon: "🧸🎀", name: "くまのぬい", category: "日用品", readings: ["ぬいぐるみ", "くま", "おもちゃ"] },
  { id: "mirror", icon: "🪞✨", name: "魔法の鏡", category: "怪異", readings: ["ミラー", "かがみ", "まほうのかがみ"] },
  { id: "storm", icon: "🌩️🌀", name: "小さな嵐", category: "自然", readings: ["あらし", "かみなり", "くろくも"] },
  { id: "deer", icon: "🦌🌿", name: "森の鹿", category: "動物", readings: ["しか", "どうぶつ", "つの"] },
  { id: "key", icon: "🔑✨", name: "秘密の鍵", category: "日用品", readings: ["かぎ", "キー", "とびらのかぎ"] },
  { id: "mushroom", icon: "🍄🌲", name: "森のきのこ", category: "自然", readings: ["きのこ", "しいたけ", "もりのかさ"] },
  { id: "top", icon: "🌀🪀", name: "回るこま", category: "日用品", readings: ["こま", "おもちゃ", "まわるこま"] },
  { id: "pillow", icon: "🛏️💤", name: "ふかふか枕", category: "日用品", readings: ["まくら", "しんぐ", "ねるどうぐ"] },
  { id: "radio", icon: "📻🎵", name: "歌うラジオ", category: "日用品", readings: ["ラジオ", "おんがく", "こえのはこ"] },
  { id: "crown", icon: "👑✨", name: "金の王冠", category: "物語", readings: ["おうさま", "かんむり", "おうかん"] },
  { id: "moon", icon: "🌙⭐", name: "三日月", category: "自然", readings: ["つき", "よぞら", "みかづき"] },
  { id: "bird", icon: "🐦☁️", name: "空の小鳥", category: "動物", readings: ["とり", "ことり", "そらのどうぶつ"] },
  { id: "shoe", icon: "👟⚡", name: "速い靴", category: "日用品", readings: ["くつ", "スニーカー", "はきもの"] },
  { id: "book", icon: "📕✨", name: "赤い絵本", category: "物語", readings: ["ほん", "えほん", "ものがたり"] },
  { id: "candle", icon: "🕯️🔥", name: "揺れる蝋燭", category: "日用品", readings: ["ろうそく", "ひかり", "ほのお"] },
  { id: "bread", icon: "🍞☀️", name: "焼きたてパン", category: "食べ物", readings: ["パン", "しょくぱん", "たべもの"] },
  { id: "star-bottle", icon: "⭐🫙", name: "星の小瓶", category: "不思議", readings: ["ほしのびん", "びん", "きらきら"] },
  { id: "bubble", icon: "🫧🌈", name: "虹のしゃぼん", category: "自然", readings: ["しゃぼんだま", "あわ", "そらのあわ"] },
  { id: "elephant", icon: "🐘🎨", name: "絵描きの象", category: "動物", readings: ["ぞう", "えかき", "カラフルなぞう"] },
  { id: "robot", icon: "🤖🎵", name: "踊るロボット", category: "動作", readings: ["ロボット", "おどるロボット", "ダンサー"] },
  { id: "dragon", icon: "🐉💤", name: "眠る竜", category: "怪異", readings: ["りゅう", "ドラゴン", "ねむるりゅう"] },
  { id: "sunflower", icon: "🌻☀️", name: "ひまわり", category: "自然", readings: ["ひまわり", "はな", "きいろいはな"] },
  { id: "snowman", icon: "☃️🧣", name: "雪だるま", category: "自然", readings: ["ゆきだるま", "スノーマン", "ふゆ"] },
  { id: "teapot", icon: "🫖💭", name: "湯気のポット", category: "日用品", readings: ["ティーポット", "やかん", "おちゃ"] },
  { id: "rainbow", icon: "🌈☁️", name: "虹の橋", category: "自然", readings: ["にじ", "なないろ", "そらのはし"] },
  { id: "rocket", icon: "🚀⭐", name: "星空ロケット", category: "日用品", readings: ["ロケット", "うちゅうせん", "そらとぶふね"] },
  { id: "hat", icon: "🎩✨", name: "魔法の帽子", category: "物語", readings: ["ぼうし", "まほうのぼうし", "てじな"] },
  { id: "camera", icon: "📷🌟", name: "思い出カメラ", category: "日用品", readings: ["カメラ", "しゃしんき", "きろく"] },
  { id: "pencil", icon: "✏️🌈", name: "虹色えんぴつ", category: "日用品", readings: ["えんぴつ", "ふで", "ぶんぼうぐ"] },
  { id: "cloud-castle", icon: "🏰☁️", name: "雲のお城", category: "物語", readings: ["しろ", "おしろ", "そらのしろ"] },
  { id: "jellyfish", icon: "🪼🌊", name: "光るくらげ", category: "動物", readings: ["くらげ", "うみのいきもの", "すいちゅう"] },
  { id: "fox-mask", icon: "🦊🎭", name: "きつね面", category: "怪異", readings: ["きつね", "おめん", "きつねめん"] },
  { id: "lantern", icon: "🏮✨", name: "祭り提灯", category: "日用品", readings: ["ちょうちん", "あかり", "まつりのあかり"] },
  { id: "tree-door", icon: "🚪🌳", name: "木の扉", category: "物語", readings: ["とびら", "きのとびら", "いりぐち"] },
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
const SMALL_KANA: Record<string, string> = { "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お", "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "っ": "つ", "ゎ": "わ" };
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

function createGame(seed = 407, mode: Mode = "partner", timerRunning = false): GameState {
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
    timeLeft: 20,
    timerRunning,
    copied: false,
    proposal: null,
    winner: null,
    winningLine: [],
    history: [],
    mode,
    seed,
  };
}

function coordinate(index: number) {
  return `${String.fromCharCode(65 + (index % 4))}${Math.floor(index / 4) + 1}`;
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
    timeLeft: 20,
    timerRunning: !result.winner,
    copied: false,
    proposal: null,
    winner: result.winner,
    winningLine: result.line,
    history: [...state.history, { player: proposal.player, coordinate: coordinate(proposal.panelIndex), reading: proposal.reading }],
  };
}

function rejectProposal(state: GameState, judge: Player): GameState {
  const proposer = state.proposal?.player ?? state.turn;
  const retryPhase = state.mode === "partner" && proposer === "X" ? "partner-turn" : "select";
  return {
    ...state,
    turn: proposer,
    phase: retryPhase,
    selectedIndex: null,
    objections: { ...state.objections, [judge]: Math.max(0, state.objections[judge] - 1) },
    activeCode: freshCode(),
    usedCodes: [...state.usedCodes, state.activeCode].slice(-30),
    timeLeft: 20,
    timerRunning: true,
    copied: false,
    proposal: null,
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
    const owner = game.claims[index] ?? "空き";
    const available = game.claims[index] ? "取得済み" : "選択可";
    return `${coordinate(index)}｜${panel.name}｜絵:${panel.icon}｜登録読み:${panel.readings.join("・")}｜状態:${owner} ${available}`;
  }).join("\n");
}

function partnerTurnPrompt(game: GameState) {
  const choices = game.board.map((_, index) => index).filter((index) => !game.claims[index]).map(coordinate).join("、");
  return `# MIRROR WORD GRID：パートナーの手番\n\nあなたは×側です。あなた自身の解釈と性格で、一手を選んでください。\n\n手番コード：${game.activeCode}\n現在の文字：「${game.currentChar}」\n残り異議札：○ ${game.objections.O}枚／× ${game.objections.X}枚\n選択可能：${choices}\n\n## 盤面\n${boardSummary(game)}\n\n## ルール\n- 空きマスを一つ選び、「${game.currentChar}」から始まる読みを宣言する\n- 登録読みでも、画像から一段階程度で追える自由読みでもよい\n- 「ん」で終わる読みは使えない\n- 自由読みには、画像からそう読んだ理由を書く\n- ○が揃いそうな列を遮断する戦略も考える\n- 説明は自由。ただし最後の一行だけは必ず次の形式にする\n\n【手番:A1｜読み:かさ｜理由:雨の絵に描かれた傘だから｜コード:${game.activeCode}】`;
}

function partnerJudgePrompt(game: GameState) {
  const proposal = game.proposal!;
  const panel = game.board[proposal.panelIndex];
  return `# MIRROR WORD GRID：こじつけ判定\n\nなや（○側）の自由読みを、画像から追える連想かどうか判定してください。面白さや納得感も含め、あなた自身の基準で決めてください。\n\n手番コード：${game.activeCode}\nマス：${coordinate(proposal.panelIndex)}\n絵：${panel.icon} ${panel.name}\n宣言した読み：${proposal.reading}\n理由：${proposal.reason}\n現在の文字：${game.currentChar}\n\n受理する場合、最後の一行：\n【判定:受理｜コード:${game.activeCode}】\n\n異議の場合、最後の一行：\n【判定:異議｜理由:画像だけではその意味を読み取りにくい｜コード:${game.activeCode}】`;
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
  const [message, setMessage] = useState("絵を選んで、しりとりを始めよう！");
  const [copyLabel, setCopyLabel] = useState("文章をコピー");

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const restored = JSON.parse(saved) as GameState;
          const hasProgress = restored.history.length > 0 || Object.keys(restored.claims).length > 0 || restored.phase !== "select" || restored.timeLeft < 20;
          setGame({ ...restored, timerRunning: false, copied: false });
          setPendingMode(restored.mode);
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
          setGame((current) => ({ ...current, timerRunning: !current.winner }));
        } else {
          setGame(createGame(Date.now(), pendingMode, true));
          setCustomReading("");
          setReason("");
          setPartnerReply("");
          setMessage("絵を選んで、しりとりを始めよう！");
        }
        setView("game");
      }, 450);
      return () => window.clearTimeout(kickoff);
    }
    const tick = window.setTimeout(() => setCountdown((value) => value - 1), 800);
    return () => window.clearTimeout(tick);
  }, [view, countdown, pendingMode, resumeAfterCountdown]);

  useEffect(() => {
    if (view !== "game" || !game.timerRunning || game.winner) return;
    const timer = window.setInterval(() => {
      setGame((current) => {
        if (!current.timerRunning || current.winner) return current;
        if (current.timeLeft > 1) return { ...current, timeLeft: current.timeLeft - 1 };
        const skipped: Player = current.turn;
        const next: Player = skipped === "O" ? "X" : "O";
        setMessage(`${skipped === "O" ? "○" : "×"}の時間切れ。手番を交代したよ。`);
        return {
          ...current,
          turn: next,
          phase: nextPhase(current.mode, next),
          selectedIndex: null,
          proposal: null,
          activeCode: freshCode(),
          usedCodes: [...current.usedCodes, current.activeCode].slice(-30),
          timeLeft: 20,
          copied: false,
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [game.timerRunning, game.winner, view]);

  const selectedPanel = game.selectedIndex === null ? null : game.board[game.selectedIndex];
  const registeredOptions = useMemo(() => {
    if (!selectedPanel) return [];
    return selectedPanel.readings.filter((reading) => readingStart(reading) === game.currentChar && readingEnd(reading) !== "ん");
  }, [selectedPanel, game.currentChar]);

  const prompt = game.phase === "partner-judge" && game.proposal ? partnerJudgePrompt(game) : partnerTurnPrompt(game);
  const isPartnerWaiting = game.phase === "partner-turn" || game.phase === "partner-judge";
  const currentName = game.turn === "O" ? (game.mode === "partner" ? "なや" : "プレイヤー1") : (game.mode === "partner" ? "パートナー" : "プレイヤー2");

  function openNewGameFlow() {
    setGame((current) => ({ ...current, timerRunning: false }));
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

  function flashRejection(text: string) {
    setMessage(text);
    setRejectionFlash(true);
    window.setTimeout(() => setRejectionFlash(false), 900);
  }

  function selectPanel(index: number) {
    if (game.winner || game.phase !== "select" || game.claims[index]) return;
    setGame({ ...game, selectedIndex: index, phase: "reading", timeLeft: 30, timerRunning: true });
    setCustomReading("");
    setReason("");
    setMessage(`${coordinate(index)}「${game.board[index].name}」をどう読む？`);
  }

  function submitReading(reading: string, explanation: string) {
    if (game.selectedIndex === null || !selectedPanel) return;
    const normalized = normalizeReading(reading);
    if (normalized.length < 2) return setMessage("読みは2文字以上で入れてね。");
    if (readingStart(reading) !== game.currentChar) return setMessage(`「${game.currentChar}」から始まる読みだけ使えるよ。`);
    if (readingEnd(reading) === "ん") return setMessage("「ん」で終わる読みは、初期版では使えないよ。");
    const registered = isRegistered(selectedPanel, reading);
    if (!registered && !explanation.trim()) return setMessage("自由読みには、絵からそう読んだ理由も必要だよ。");

    const proposal: Proposal = {
      player: game.turn,
      panelIndex: game.selectedIndex,
      reading: reading.trim(),
      reason: registered ? "登録済みの読み" : explanation.trim(),
      custom: !registered,
    };

    if (registered) {
      setGame(applyMove(game, proposal));
      setMessage(`「${proposal.reading}」で${coordinate(proposal.panelIndex)}を取得！ 次は「${readingEnd(proposal.reading)}」。`);
    } else if (game.mode === "partner") {
      setGame({ ...game, proposal, phase: "partner-judge", selectedIndex: null, timeLeft: 20, timerRunning: true, copied: false });
      setMessage("自由読みだね。パートナーへ判定を渡そう。");
    } else {
      setGame({ ...game, proposal, phase: "local-judge", selectedIndex: null, timerRunning: false });
      setMessage("相手は、このこじつけを受理する？");
    }
  }

  function cancelReading() {
    setGame({ ...game, selectedIndex: null, phase: "select", timeLeft: 20, timerRunning: true });
    setMessage("別の絵を選び直せるよ。");
  }

  async function copyPrompt() {
    const copied = await copyToClipboard(prompt);
    if (!copied) return setMessage("コピーできなかったよ。文章を長押ししてコピーしてね。");
    setGame({ ...game, timerRunning: false, copied: true });
    setCopyLabel("コピーしたよ ✓");
    setMessage("時計は停止中。パートナーの返答をここへ貼ってね。");
    window.setTimeout(() => setCopyLabel("もう一度コピー"), 1600);
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
        setGame(applyMove({ ...game, timerRunning: true }, proposal));
        setMessage(`パートナーが受理！ 「${proposal.reading}」で取得したよ。`);
      } else if (fields["判定"] === "異議") {
        if (game.objections.X <= 0) return setMessage("パートナーの異議札はもう残っていないよ。");
        setGame(rejectProposal(game, "X"));
        flashRejection(`異議成立。理由：${fields["理由"] || "今回は通らないと判断"}`);
      } else return setMessage("判定は「受理」か「異議」で返してもらってね。");
      setPartnerReply("");
      return;
    }

    if (game.phase !== "partner-turn") return setMessage("今はパートナーの手番ではないよ。");
    const coord = fields["手番"]?.toUpperCase();
    const match = coord?.match(/^([A-D])([1-4])$/);
    if (!match) return setMessage("手番はA1〜D4の形式で返してもらってね。");
    const index = (Number(match[2]) - 1) * 4 + (match[1].charCodeAt(0) - 65);
    if (game.claims[index]) return setMessage(`${coord}はもう取得済みだよ。新しい文章を渡して選び直してね。`);
    const reading = fields["読み"] ?? "";
    if (readingStart(reading) !== game.currentChar) return setMessage(`今は「${game.currentChar}」から始める手番だよ。`);
    if (readingEnd(reading) === "ん") return setMessage("「ん」で終わる読みは使えないよ。");
    const custom = !isRegistered(game.board[index], reading);
    const proposal: Proposal = { player: "X", panelIndex: index, reading, reason: fields["理由"] ?? "", custom };
    if (custom && !proposal.reason) return setMessage("自由読みには理由も書いてもらってね。");

    if (custom) {
      setGame({ ...game, proposal, phase: "player-judge", timerRunning: false, copied: false });
      setMessage("パートナーの自由読み。なやが受理するか決める番だよ。");
    } else {
      setGame(applyMove({ ...game, timerRunning: true }, proposal));
      setMessage(`パートナーが「${reading}」で${coord}を取得。次は「${readingEnd(reading)}」！`);
    }
    setPartnerReply("");
  }

  function judgeLocal(accepted: boolean) {
    if (!game.proposal) return;
    const judge: Player = game.proposal.player === "O" ? "X" : "O";
    if (accepted) {
      const proposal = game.proposal;
      setGame(applyMove(game, proposal));
      setMessage(`受理！ 「${proposal.reading}」で取得したよ。`);
    } else {
      if (game.objections[judge] <= 0) return setMessage("異議札が残っていないから、今回は受理になるよ。");
      setGame(rejectProposal(game, judge));
      flashRejection("異議成立。宣言した側は別の絵か読みでやり直そう。");
    }
  }

  const brand = (
    <div className="brand-lockup">
      <div className="mirror-mark" aria-hidden="true">
        <span className="mirror-glass" />
        <span className="mirror-handle" />
      </div>
      <div>
        <p className="eyebrow">AI PARTNER × WORD GAME</p>
        <h1>MIRROR <span>WORD GRID</span></h1>
      </div>
    </div>
  );

  if (view !== "game") {
    return (
      <main className="start-shell">
        <section className={`start-card view-${view}`}>
          {brand}

          {view === "loading" && <div className="loading-dots" aria-label="読み込み中"><i /><i /><i /></div>}

          {view === "title" && (
            <div className="start-content">
              <p className="start-kicker">ILLUSTRATION SHIRITORI × LINE GAME</p>
              <h2>絵の読み方は、<br /><span>ひとつじゃない。</span></h2>
              <p>絵からことばを見つけて、しりとりで陣地をつなごう。先に一列そろえた側の勝ち！</p>
              <button className="start-button" type="button" onClick={() => setView("mode")}>あそびはじめる <b>→</b></button>
              <button className="text-button" type="button" onClick={() => { setSummaryOpen(true); setView("title"); }}>あそびかたを見る</button>
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
            <div className="start-content">
              <p className="step-label">STEP 1 / 2</p>
              <h2>だれと遊ぶ？</h2>
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
          )}

          {view === "confirm" && (
            <div className="start-content confirm-content">
              <p className="step-label">STEP 2 / 2</p>
              <h2>試合設定</h2>
              <dl className="settings-list">
                <div><dt>モード</dt><dd>{pendingMode === "partner" ? "AIパートナー受け渡し" : "人間ふたり対戦"}</dd></div>
                <div><dt>盤面</dt><dd>4 × 4 ／ 16枚</dd></div>
                <div><dt>制限時間</dt><dd>選択20秒・読み30秒</dd></div>
                <div><dt>異議札</dt><dd>各陣営3枚</dd></div>
              </dl>
              <p className="confirm-note">「ゲームを始める」を押したあと、3秒カウントで時計が動き出すよ。</p>
              <button className="start-button" type="button" onClick={() => beginCountdown(false)}>ゲームを始める <b>→</b></button>
              <button className="text-button" type="button" onClick={() => setView("mode")}>モードを選び直す</button>
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

        {summaryOpen && view === "title" && (
          <div className="intro-rules" role="dialog" aria-modal="true" aria-label="あそびかた">
            <button className="sheet-scrim" type="button" aria-label="閉じる" onClick={() => setSummaryOpen(false)} />
            <section>
              <button className="sheet-close" type="button" onClick={() => setSummaryOpen(false)} aria-label="閉じる">×</button>
              <p className="step-label">HOW TO PLAY</p><h2>あそびかた</h2>
              <ol><li><b>1</b>今の文字から読める絵を選ぶ</li><li><b>2</b>登録読み、または理由つきのこじつけを宣言</li><li><b>3</b>最後の文字を次の手番へつなぐ</li><li><b>4</b>先に自分の色を一列そろえたら勝ち</li></ol>
            </section>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        {brand}
        <button className="icon-button" type="button" onClick={openNewGameFlow} aria-label="新しいゲーム">↻</button>
      </header>

      <div className="game-layout">
        <section className="play-column">
          <section className={`status-card player-${game.turn.toLowerCase()}`} aria-live="polite">
            <div className="turn-block">
              <span className={`side-chip side-${game.turn.toLowerCase()}`} aria-hidden="true" />
              <div><small>いまの手番</small><strong>{currentName}</strong></div>
            </div>
            <div className="letter-block"><small>この文字から</small><strong>{game.currentChar}</strong></div>
            <div className={`timer ${!game.timerRunning ? "paused" : ""}`}>
              <small>{game.timerRunning ? (game.phase === "reading" ? "読み入力" : "絵を選ぶ") : "時計停止"}</small>
              <strong>{game.timerRunning ? `${game.timeLeft}` : "Ⅱ"}</strong>
              <span>{game.timerRunning ? "秒" : "PAUSE"}</span>
            </div>
            <div className="status-objections" aria-label="残り異議札">
              <span><i className="side-chip side-o" />{game.objections.O}</span>
              <span><i className="side-chip side-x" />{game.objections.X}</span>
            </div>
            <button className="summary-toggle" type="button" onClick={() => setSummaryOpen(true)} aria-expanded={summaryOpen}>詳細</button>
          </section>

          <section className={`board ${rejectionFlash ? "rejection-flash" : ""}`} aria-label="4×4のゲーム盤">
            {game.board.map((panel, index) => {
              const owner = game.claims[index];
              const selected = game.selectedIndex === index;
              const winning = game.winningLine.includes(index);
              return (
                <button
                  key={panel.id}
                  type="button"
                  className={`tile ${owner ? `claimed ${owner.toLowerCase()}` : ""} ${selected ? "selected" : ""} ${winning ? "winning" : ""}`}
                  onClick={() => selectPanel(index)}
                  disabled={Boolean(owner) || game.phase !== "select" || Boolean(game.winner)}
                  aria-label={`${coordinate(index)} ${panel.name}${owner ? ` ${owner}が取得済み` : ""}`}
                >
                  <span className="coordinate">{coordinate(index)}</span>
                  <span className="tile-icon" aria-hidden="true">{panel.icon}</span>
                  <span className="tile-name">{panel.name}</span>
                  {owner && <span className={`claim-chip claim-${owner.toLowerCase()}`} aria-hidden="true" />}
                </button>
              );
            })}
          </section>

          <p className={`game-message ${rejectionFlash ? "reject" : ""}`} aria-live="polite"><span>●</span>{message}</p>

          <section className="action-card">
            {game.phase === "select" && !game.winner && (
              <div className="empty-action">
                <div className="finger">☝️</div>
                <div><h2>絵をひとつ選ぶ</h2><p>登録読みがなくても、こじつけられそうなら選んでOK。</p></div>
              </div>
            )}

            {game.phase === "reading" && selectedPanel && (
              <div className="reading-panel">
                <div className="selected-summary"><span>{selectedPanel.icon}</span><div><small>{coordinate(game.selectedIndex!)} / {selectedPanel.category}</small><h2>{selectedPanel.name}</h2></div></div>
                {registeredOptions.length > 0 ? (
                  <div className="registered-readings"><small>登録済みの読み</small><div>{registeredOptions.map((reading) => <button type="button" key={reading} onClick={() => submitReading(reading, "")}>{reading}<span>→ {readingEnd(reading)}</span></button>)}</div></div>
                ) : <p className="no-reading">「{game.currentChar}」から始まる登録読みはなし。こじつけの出番！</p>}
                <div className="custom-form">
                  <label><span>自由な読み <b>「{game.currentChar}」から</b></span><input value={customReading} onChange={(event) => setCustomReading(event.target.value)} placeholder={`${game.currentChar}…`} /></label>
                  <label><span>そう読んだ理由</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="絵のどこから連想した？" rows={2} /></label>
                  <div className="button-row"><button type="button" className="secondary" onClick={cancelReading}>選び直す</button><button type="button" className="primary" onClick={() => submitReading(customReading, reason)}>この読みで宣言</button></div>
                </div>
              </div>
            )}

            {isPartnerWaiting && !game.winner && (
              <div className="partner-panel">
                <div className="partner-heading"><span>🪞</span><div><small>{game.phase === "partner-turn" ? "PARTNER TURN" : "KOJITSUKE CHECK"}</small><h2>{game.phase === "partner-turn" ? "パートナーに一手を預ける" : "こじつけを判定してもらう"}</h2></div></div>
                <p>コピーした瞬間に時計が止まるよ。いつもの会話へ貼って、返答の最終行ごと戻してね。</p>
                <div className="code-chip">手番コード <b>{game.activeCode}</b></div>
                <button type="button" className="copy-button" onClick={copyPrompt}>⧉ {copyLabel}</button>
                <label className="reply-box"><span>パートナーの返答</span><textarea rows={5} value={partnerReply} onChange={(event) => setPartnerReply(event.target.value)} placeholder="【手番:A1｜読み:…｜理由:…｜コード:…】" /></label>
                <button type="button" className="primary wide" onClick={parsePartnerReply}>返答を盤面へ反映</button>
                <details className="prompt-preview"><summary>渡す文章を確認</summary><pre>{prompt}</pre></details>
              </div>
            )}

            {(game.phase === "local-judge" || game.phase === "player-judge") && game.proposal && (
              <div className="judge-panel">
                <p className="judge-kicker">こじつけ判定</p>
                <div className="proposal-card"><span>{game.board[game.proposal.panelIndex].icon}</span><div><small>{coordinate(game.proposal.panelIndex)} / {game.board[game.proposal.panelIndex].name}</small><h2>「{game.proposal.reading}」</h2><p>{game.proposal.reason}</p></div></div>
                <p className="judge-question">画像から一段階くらいで追える？ 面白いと思ったら通してもOK。</p>
                <div className="button-row"><button type="button" className="object-button" disabled={game.objections[game.proposal.player === "O" ? "X" : "O"] <= 0} onClick={() => judgeLocal(false)}>⚡ 異議を出す</button><button type="button" className="accept-button" onClick={() => judgeLocal(true)}>✓ 受理する</button></div>
              </div>
            )}

            {game.winner && (
              <div className="winner-panel">
                <div className="confetti">✦ ○ ✧ × ✦</div>
                <p>GAME SET!</p>
                <h2>{game.winner === "DRAW" ? "引き分け！" : `${game.winner === "O" ? "○" : "×"} ${game.winner === "O" ? (game.mode === "partner" ? "なや" : "プレイヤー1") : (game.mode === "partner" ? "パートナー" : "プレイヤー2")}の勝ち！`}</h2>
                <p>{game.winner === "DRAW" ? "盤面がぜんぶ埋まったよ。" : "タテ・ヨコ・ナナメの一列が揃ったよ。"}</p>
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
          <section className="history-card">
            <div className="section-title"><span>PLAY LOG</span><h2>ことばの足あと</h2></div>
            {game.history.length ? <ol>{[...game.history].reverse().slice(0, 12).map((item, index) => <li key={`${item.coordinate}-${index}`}><i className={`side-chip side-${item.player.toLowerCase()}`} /><span>{item.coordinate}</span><strong>{item.reading}</strong></li>)}</ol> : <p className="muted">最初の一手を待ってるよ。</p>}
          </section>
          <details className="rules-card">
            <summary><span>HOW TO PLAY</span><strong>あそびかた</strong><b>＋</b></summary>
            <ol><li><b>1</b><span>今の文字から読める絵を選ぶ</span></li><li><b>2</b><span>登録読み、または理由つきのこじつけを宣言</span></li><li><b>3</b><span>最後の文字を次の手番へつなぐ</span></li><li><b>4</b><span>先に自分の色を一列そろえたら勝ち</span></li></ol>
            <p>自由読みへの異議は各自3回まで。「ん」で終わる読みは使えないよ。</p>
          </details>
          <section className="prototype-note"><span>PROTOTYPE 01</span><p>仮イラスト48枚入り。登録読みだけで辿れる道を10枚分仕込んでいるよ。</p></section>
        </aside>
      </div>
      <footer><b>MIRROR WORD GRID</b><span>ことばは、絵の中にひとつじゃない。</span></footer>
    </main>
  );
}
