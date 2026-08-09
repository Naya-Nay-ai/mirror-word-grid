export type Player = "O" | "X";

export type Panel = {
  id: string;
  icon: string;
  name: string;
  category: string;
  readings: string[];
  visualDescription: string;
};

export type RejectedAttempt = {
  panelIndex: number;
  reading: string;
};

export const WIN_LINES_4 = [
  [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
  [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
  [0, 5, 10, 15], [3, 6, 9, 12],
] as const;

export function hasCompletableLine(claims: Record<number, Player>, player: Player) {
  const opponent: Player = player === "O" ? "X" : "O";
  return WIN_LINES_4.some((line) => line.every((index) => claims[index] !== opponent));
}

export function findWinner(claims: Record<number, Player>) {
  for (const line of WIN_LINES_4) {
    const owner = claims[line[0]];
    if (owner && line.every((index) => claims[index] === owner)) return { winner: owner, line: [...line] };
  }
  if (!hasCompletableLine(claims, "O") && !hasCompletableLine(claims, "X")) {
    return { winner: "DRAW" as const, line: [] };
  }
  return { winner: null, line: [] };
}

const SMALL_KANA: Record<string, string> = {
  "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お",
  "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "っ": "つ", "ゎ": "わ",
};

// この対応範囲は仮仕様。今後の調整をこの表だけで行えるように分離している。
const CLEAR_KANA: Record<string, string> = {
  "が": "か", "ぎ": "き", "ぐ": "く", "げ": "け", "ご": "こ",
  "ざ": "さ", "じ": "し", "ず": "す", "ぜ": "せ", "ぞ": "そ",
  "だ": "た", "ぢ": "ち", "づ": "つ", "で": "て", "ど": "と",
  "ば": "は", "び": "ひ", "ぶ": "ふ", "べ": "へ", "ぼ": "ほ",
  "ぱ": "は", "ぴ": "ひ", "ぷ": "ふ", "ぺ": "へ", "ぽ": "ほ",
  "ゔ": "う",
};

const VOWEL_GROUPS: Record<string, string> = {
  あ: "あかがさざただなはばぱまやらわ",
  い: "いきぎしじちぢにひびぴみり",
  う: "うくぐすずつづぬふぶぷむゆる",
  え: "えけげせぜてでねへべぺめれ",
  お: "おこごそぞとどのほぼぽもよろを",
};

// 「お・ご」で始まる独立語。正式プリセットはこの表に関係なく常に有効。
export const ESTABLISHED_PREFIX_WORDS = new Set([
  "おちゃ", "おかし", "おにぎり", "ごはん", "おうさま",
]);

export function normalizeReading(value: string) {
  return value
    .trim()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s　・!！?？。、,.]/g, "")
    .toLowerCase();
}

export function readingStart(value: string) {
  const normalized = normalizeReading(value);
  return SMALL_KANA[normalized[0]] ?? normalized[0] ?? "";
}

export function clearKana(value: string) {
  return CLEAR_KANA[value] ?? value;
}

export function readingStartsWith(value: string, currentChar: string) {
  return clearKana(readingStart(value)) === clearKana(currentChar);
}

export function readingEnd(value: string) {
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

export function isRegistered(panel: Panel, reading: string) {
  const normalized = normalizeReading(reading);
  return panel.readings.some((item) => normalizeReading(item) === normalized);
}

export function isRepeatedRejectedReading(attempts: RejectedAttempt[], panelIndex: number, reading: string) {
  const normalized = normalizeReading(reading);
  return attempts.some((attempt) => attempt.panelIndex === panelIndex && attempt.reading === normalized);
}

export function hasArtificialPolitePrefix(panel: Panel, reading: string) {
  const normalized = normalizeReading(reading);
  if (isRegistered(panel, normalized) || ESTABLISHED_PREFIX_WORDS.has(normalized)) return false;
  if (!normalized.startsWith("お") && !normalized.startsWith("ご")) return false;
  const base = normalized.slice(1);
  const knownBases = [panel.name, ...panel.readings].map(normalizeReading);
  return knownBases.includes(base);
}

export function availablePresetReadings(panel: Panel, currentChar: string, allowNEnding: boolean) {
  return panel.readings.filter((reading) => (
    readingStartsWith(reading, currentChar) && (allowNEnding || readingEnd(reading) !== "ん")
  ));
}

export function winnerAfterNEnding(player: Player): Player {
  return player === "O" ? "X" : "O";
}

export function nextRetryBlocks(
  claims: Record<number, Player>,
  currentBlocks: number[],
  rejectedIndex: number,
  boardSize: number,
) {
  const blocked = [...new Set([...currentBlocks, rejectedIndex])];
  const hasSelectableEmpty = Array.from({ length: boardSize }, (_, index) => index)
    .some((index) => !claims[index] && !blocked.includes(index));
  return hasSelectableEmpty ? blocked : [];
}
