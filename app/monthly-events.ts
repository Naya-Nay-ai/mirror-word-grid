import { chooseRandomStart, type BoardSize, type Panel } from "./game-rules";
import { PANELS } from "./panel-dictionary";

type MonthlyEventTheme = {
  key: string;
  label: string;
  panels: Panel[];
  spines: readonly (readonly string[])[];
};

export const MONTHLY_EVENT_LABELS: Record<number, string> = {
  1: "お正月",
  2: "バレンタイン",
  3: "春のおめかし",
  4: "お花見",
  5: "新緑",
  6: "雨の日",
  7: "七夕",
  8: "夏祭り",
  9: "お月見",
  10: "ハロウィン",
  11: "紅葉",
  12: "クリスマス",
};

const HALLOWEEN_BASE_IDS = [
  "gift-ghost",
  "box-cat",
  "moon",
  "candle",
  "mushroom",
  "fire",
  "fox-mask",
  "hat",
  "star-bottle",
  "scream",
  "dragon",
  "plush",
] as const;

const HALLOWEEN_EXTRA_PANELS: Panel[] = [
  { id: "event-oct-pumpkin", icon: "🎃", name: "かぼちゃ", category: "季節", readings: ["かぼちゃ", "パンプキン", "ジャックオランタン", "ハロウィン"], visualDescription: "顔が彫られたハロウィンのかぼちゃ" },
  { id: "event-oct-bat", icon: "🦇", name: "こうもり", category: "動物", readings: ["こうもり", "コウモリ", "バット", "よる"], visualDescription: "羽を広げたこうもり" },
  { id: "event-oct-candy", icon: "🍬", name: "キャンディ", category: "食べ物", readings: ["キャンディ", "あめ", "おかし", "スイーツ"], visualDescription: "包み紙に包まれたキャンディ" },
  { id: "event-oct-lollipop", icon: "🍭", name: "ぺろぺろキャンディ", category: "食べ物", readings: ["ぺろぺろキャンディ", "ロリポップ", "キャンディ", "おかし"], visualDescription: "棒についた渦巻きキャンディ" },
  { id: "event-oct-web", icon: "🕸️", name: "くものす", category: "自然", readings: ["くものす", "ウェブ", "いと", "ハロウィン"], visualDescription: "放射状に広がるくもの巣" },
  { id: "event-oct-spider", icon: "🕷️", name: "くも", category: "動物", readings: ["くも", "スパイダー", "むし", "ハロウィン"], visualDescription: "八本脚のくも" },
  { id: "event-oct-skull", icon: "💀", name: "どくろ", category: "空想", readings: ["どくろ", "がいこつ", "スカル", "ホラー"], visualDescription: "白い頭蓋骨" },
  { id: "event-oct-crossbones", icon: "☠️", name: "どくろマーク", category: "記号", readings: ["どくろマーク", "スカル", "きけん", "ホラー"], visualDescription: "頭蓋骨と交差した骨の記号" },
  { id: "event-oct-coffin", icon: "⚰️", name: "ひつぎ", category: "物", readings: ["ひつぎ", "コフィン", "かん", "ホラー"], visualDescription: "ふたの閉じた棺" },
  { id: "event-oct-headstone", icon: "🪦", name: "はか", category: "物", readings: ["はか", "はかいし", "ぼち", "ホラー"], visualDescription: "地面に立つ墓石" },
  { id: "event-oct-crystal-ball", icon: "🔮", name: "すいしょうだま", category: "空想", readings: ["すいしょうだま", "うらない", "クリスタルボール", "まほう"], visualDescription: "台座に置かれた水晶玉" },
  { id: "event-oct-broom", icon: "🧹", name: "ほうき", category: "日用品", readings: ["ほうき", "ブルーム", "そうじ", "まじょ"], visualDescription: "柄の長いほうき" },
  { id: "event-oct-wand", icon: "🪄", name: "まほうのつえ", category: "空想", readings: ["まほうのつえ", "つえ", "ワンド", "まほう"], visualDescription: "星の光が出る魔法の杖" },
  { id: "event-oct-test-tube", icon: "🧪", name: "しけんかん", category: "道具", readings: ["しけんかん", "ポーション", "くすり", "じっけん"], visualDescription: "液体が入った試験管" },
  { id: "event-oct-alembic", icon: "⚗️", name: "じょうりゅうき", category: "道具", readings: ["じょうりゅうき", "れんきんじゅつ", "フラスコ", "じっけん"], visualDescription: "実験に使う蒸留器" },
  { id: "event-oct-owl", icon: "🦉", name: "ふくろう", category: "動物", readings: ["ふくろう", "みみずく", "オウル", "よる"], visualDescription: "正面を向いたふくろう" },
  { id: "event-oct-wolf", icon: "🐺", name: "おおかみ", category: "動物", readings: ["おおかみ", "ウルフ", "けもの", "よる"], visualDescription: "おおかみの顔" },
  { id: "event-oct-bone", icon: "🦴", name: "ほね", category: "物", readings: ["ほね", "ボーン", "がいこつ", "スカル"], visualDescription: "一本の白い骨" },
  { id: "event-oct-cookie", icon: "🍪", name: "クッキー", category: "食べ物", readings: ["クッキー", "ビスケット", "おかし", "スイーツ"], visualDescription: "丸い焼き菓子" },
  { id: "event-oct-pie", icon: "🥧", name: "パイ", category: "食べ物", readings: ["パイ", "パンプキンパイ", "おかし", "やきがし"], visualDescription: "丸い焼きパイ" },
  { id: "event-oct-cupcake", icon: "🧁", name: "カップケーキ", category: "食べ物", readings: ["カップケーキ", "ケーキ", "おかし", "スイーツ"], visualDescription: "クリームがのったカップケーキ" },
  { id: "event-oct-corn", icon: "🌽", name: "とうもろこし", category: "食べ物", readings: ["とうもろこし", "コーン", "しゅうかく", "あき"], visualDescription: "皮のついたとうもろこし" },
  { id: "event-oct-fallen-leaf", icon: "🍂", name: "おちば", category: "自然", readings: ["おちば", "はっぱ", "あき", "こうよう"], visualDescription: "舞い落ちる茶色い葉" },
  { id: "event-oct-maple", icon: "🍁", name: "もみじ", category: "自然", readings: ["もみじ", "かえで", "こうよう", "あき"], visualDescription: "赤いもみじの葉" },
  { id: "event-oct-masks", icon: "🎭", name: "かめん", category: "遊び", readings: ["かめん", "マスク", "へんそう", "コスチューム"], visualDescription: "二つ並んだ仮面" },
  { id: "event-oct-full-moon", icon: "🌕", name: "まんげつ", category: "自然", readings: ["まんげつ", "つき", "ムーン", "よぞら"], visualDescription: "丸い満月" },
  { id: "event-oct-new-moon", icon: "🌑", name: "しんげつ", category: "自然", readings: ["しんげつ", "つき", "ムーン", "よる"], visualDescription: "暗い新月" },
  { id: "event-oct-chain", icon: "⛓️", name: "くさり", category: "物", readings: ["くさり", "チェーン", "つながり", "てつ"], visualDescription: "金属の鎖" },
  { id: "event-oct-hourglass", icon: "⌛", name: "すなどけい", category: "日用品", readings: ["すなどけい", "とけい", "タイマー", "じかん"], visualDescription: "砂が落ちる砂時計" },
  { id: "event-oct-door", icon: "🗝️", name: "ふるいかぎ", category: "物", readings: ["ふるいかぎ", "かぎ", "キー", "ひみつ"], visualDescription: "古びた鍵" },
];

function panelById(id: string) {
  return PANELS.find((panel) => panel.id === id);
}

const HALLOWEEN_PANELS: Panel[] = [
  ...HALLOWEEN_BASE_IDS.map(panelById).filter((panel): panel is Panel => Boolean(panel)),
  ...HALLOWEEN_EXTRA_PANELS,
];

const OCTOBER_THEME: MonthlyEventTheme = {
  key: "halloween",
  label: "ハロウィン",
  panels: HALLOWEEN_PANELS,
  spines: [
    ["event-oct-pumpkin", "gift-ghost", "event-oct-bat", "event-oct-candy", "event-oct-web", "moon", "candle", "event-oct-skull", "mushroom", "event-oct-crystal-ball"],
    ["box-cat", "event-oct-broom", "event-oct-owl", "event-oct-full-moon", "event-oct-cookie", "event-oct-wand", "event-oct-bone", "event-oct-maple", "fire", "scream"],
  ],
};

const MONTHLY_EVENT_THEMES: Partial<Record<number, MonthlyEventTheme>> = {
  10: OCTOBER_THEME,
};

function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => ((value = (value * 16807) % 2147483647) - 1) / 2147483646;
}

function shuffled<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(random() * (index + 1));
    [result[index], result[nextIndex]] = [result[nextIndex], result[index]];
  }
  return result;
}

export function currentTokyoMonth(date = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
  }).format(date));
}

export function getMonthlyEventTheme(month = currentTokyoMonth()) {
  return MONTHLY_EVENT_THEMES[month] ?? null;
}

export function getMonthlyEventBoard(seed: number, boardSize: BoardSize, month = currentTokyoMonth()) {
  const theme = getMonthlyEventTheme(month);
  if (!theme) return null;

  const required = boardSize * boardSize;
  if (theme.panels.length < required) return null;

  const random = seededRandom(seed + month * 1009);
  const spine = theme.spines[Math.floor(random() * theme.spines.length)] ?? [];
  const core = spine
    .map((id) => theme.panels.find((panel) => panel.id === id))
    .filter((panel): panel is Panel => Boolean(panel))
    .slice(0, required);
  const coreIds = new Set(core.map((panel) => panel.id));
  const rest = shuffled(theme.panels.filter((panel) => !coreIds.has(panel.id)), random)
    .slice(0, required - core.length);
  const board = shuffled([...core, ...rest], random);

  return {
    board,
    start: chooseRandomStart(board, random),
    eventKey: theme.key,
    eventLabel: theme.label,
  };
}
