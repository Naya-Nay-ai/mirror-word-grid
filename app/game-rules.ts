export type Player = "O" | "X";
export type BoardSize = 4 | 5;

export function recommendedObjectionCount(boardSize: 3 | BoardSize) {
  return boardSize === 3 ? 2 : 3;
}

export function canUseObjection(remaining: number, usedThisTurn: boolean) {
  return remaining > 0 && !usedThisTurn;
}

/**
 * マスごとに、どちらの側がそのマスへの読みへ異議を使ったかを記録する。
 * Record + 配列だけにして、localStorage と Redis のどちらにもそのまま保存できる形にする。
 */
export type CellObjectionHistory = Record<number, Player[]>;

export function recordCellObjection(
  history: CellObjectionHistory | undefined,
  panelIndex: number,
  judge: Player,
): CellObjectionHistory {
  const current = history?.[panelIndex] ?? [];
  if (current.includes(judge)) return history ?? {};
  return { ...(history ?? {}), [panelIndex]: [...current, judge] };
}

export function isContestedCell(history: CellObjectionHistory | undefined, panelIndex: number) {
  const judges = history?.[panelIndex] ?? [];
  return judges.includes("O") && judges.includes("X");
}

export function isLastEmptyCell(
  claims: Record<number, Player>,
  panelIndex: number,
  boardLength: number,
) {
  return !claims[panelIndex] && Object.keys(claims).length === boardLength - 1;
}

export type PresetReading = string | {
  display: string;
  reading: string;
};

export type Panel = {
  id: string;
  icon: string;
  name: string;
  category: string;
  readings: PresetReading[];
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

export const WIN_LINES_5 = [
  [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
] as const;

export function winLinesFor(boardSize: BoardSize): readonly (readonly number[])[] {
  return boardSize === 5 ? WIN_LINES_5 : WIN_LINES_4;
}

export function hasCompletableLine(claims: Record<number, Player>, player: Player, boardSize: BoardSize = 4) {
  const opponent: Player = player === "O" ? "X" : "O";
  return winLinesFor(boardSize).some((line) => line.every((index) => claims[index] !== opponent));
}

export function findWinner(claims: Record<number, Player>, boardSize: BoardSize = 4) {
  for (const line of winLinesFor(boardSize)) {
    const owner = claims[line[0]];
    if (owner && line.every((index) => claims[index] === owner)) return { winner: owner, line: [...line] };
  }
  if (!hasCompletableLine(claims, "O", boardSize) && !hasCompletableLine(claims, "X", boardSize)) {
    return { winner: "DRAW" as const, line: [] };
  }
  return { winner: null, line: [] };
}

const SMALL_KANA: Record<string, string> = {
  "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お",
  "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "っ": "つ", "ゎ": "わ",
  "ゕ": "か", "ゖ": "け",
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

export function presetReadingValue(value: PresetReading) {
  return typeof value === "string" ? value : value.reading;
}

export function presetReadingDisplay(value: PresetReading) {
  return typeof value === "string" ? value : value.display;
}

export function normalizeReading(value: string) {
  return value
    .trim()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s　・!！?？。、,.]/g, "")
    .toLowerCase();
}

export function isKanaOnlyReading(value: string) {
  const compact = value.trim().replace(/[\s　・!！?？。、,.]/g, "");
  return compact.length > 0 && /^[\u3040-\u30ff]+$/u.test(compact);
}

export type DeclaredReadingResult =
  | { display: string; reading: string }
  | { error: string };

export function resolveDeclaredReading(display: string, readingAid = ""): DeclaredReadingResult {
  const label = display.trim();
  const aid = readingAid.trim();
  if (!label) return { error: "自由読みを入力してね。" };
  if (isKanaOnlyReading(label) && !aid) return { display: label, reading: label };
  if (!aid) return { error: "漢字・々・英数字などを使うときは、判定用の読み仮名も入力してね。" };
  if (!isKanaOnlyReading(aid)) return { error: "読み仮名は、ひらがなかカタカナで入力してね。" };
  return { display: label, reading: aid };
}

export type MachineReplyParseResult =
  | { ok: true; fields: Record<string, string>; line: string }
  | { ok: false; error: string };

const MACHINE_REPLY_ERROR = "パートナー返答を正しく読み取れませんでした。機械読取用の1行だけ、またはそのコードブロックを含むAIの返答を貼り付けてください。";

function isCompleteMachineLine(value: string) {
  return /^【(?:手番|判定|準備)[:：][^【】\r\n]+】$/u.test(value);
}

export function parseMachineReply(text: string): MachineReplyParseResult {
  const input = text.trim();
  const candidates: string[] = [];

  // AIのコードブロックにある「コピー」は、Markdownフェンスを除いた
  // 中身だけを渡す。その正式操作では、入力全体が機械読取1行であることを必須にする。
  if (isCompleteMachineLine(input)) {
    candidates.push(input);
  } else {
    // 回答全文を貼った場合は、独立コードブロックの中身が機械読取1行だけの
    // ブロックだけを候補にする。本文や回答例にある角括弧行は検索しない。
    for (const match of input.matchAll(/```[^\r\n]*\r?\n([\s\S]*?)```/g)) {
      const content = match[1].trim();
      if (isCompleteMachineLine(content)) candidates.push(content);
    }
  }
  if (candidates.length !== 1) {
    return { ok: false, error: MACHINE_REPLY_ERROR };
  }

  const line = candidates[0];
  const fields: Record<string, string> = {};
  for (const part of line.slice(1, -1).split(/[｜|]/)) {
    const splitAt = part.search(/[:：]/);
    if (splitAt <= 0) return { ok: false, error: MACHINE_REPLY_ERROR };
    const key = part.slice(0, splitAt).trim();
    const value = part.slice(splitAt + 1).trim();
    if (!key || !value || fields[key]) return { ok: false, error: MACHINE_REPLY_ERROR };
    fields[key] = value;
  }
  return { ok: true, fields, line };
}

function normalizeKanaChar(value: string) {
  const normalized = normalizeReading(value);
  const char = normalized[0] ?? "";
  return SMALL_KANA[char] ?? char;
}

export function readingStart(value: string) {
  return normalizeKanaChar(value);
}

export function clearKana(value: string) {
  const kana = normalizeKanaChar(value);
  return CLEAR_KANA[kana] ?? kana;
}

export function readingStartsWith(value: string, currentChar: string) {
  return clearKana(readingStart(value)) === clearKana(currentChar);
}

function vowelForKana(value: string) {
  const kana = SMALL_KANA[value] ?? value;
  for (const [vowel, chars] of Object.entries(VOWEL_GROUPS)) {
    if (chars.includes(kana)) return vowel;
  }
  return "";
}

export function readingEnd(value: string) {
  const normalized = normalizeReading(value);
  if (!normalized) return "";
  const last = normalized.at(-1) ?? "";
  if (last !== "ー") return SMALL_KANA[last] ?? last;

  // 長音は直前音の母音へつなぐ。直前が小書きかなでも、先に通常かなへ直して判定する。
  // 例: コーギー→い / ティー→い / シュー→う / ショー→お / ファー→あ
  let index = normalized.length - 2;
  while (index >= 0 && normalized[index] === "ー") index -= 1;
  const before = SMALL_KANA[normalized[index] ?? ""] ?? normalized[index] ?? "";
  return vowelForKana(before) || before;
}

export function chooseRandomStart(board: Panel[], random: () => number) {
  const matchingPanels = new Map<string, Set<string>>();
  board.forEach((panel) => panel.readings.forEach((item) => {
    const reading = presetReadingValue(item);
    if (readingEnd(reading) === "ん") return;
    const start = clearKana(readingStart(reading));
    if (!start) return;
    const ids = matchingPanels.get(start) ?? new Set<string>();
    ids.add(panel.id);
    matchingPanels.set(start, ids);
  }));
  const wellSupported = [...matchingPanels.entries()].filter(([, panels]) => panels.size >= 2).map(([start]) => start);
  const candidates = wellSupported.length ? wellSupported : [...matchingPanels.keys()];
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))] ?? "か";
}

export function isRegistered(panel: Panel, reading: string) {
  const normalized = normalizeReading(reading);
  return panel.readings.some((item) => normalizeReading(presetReadingValue(item)) === normalized);
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
  const knownBases = [panel.name, ...panel.readings.map(presetReadingValue)].map(normalizeReading);
  return knownBases.includes(base);
}

export function availablePresetReadings(panel: Panel, currentChar: string, allowNEnding: boolean) {
  return panel.readings.filter((reading) => (
    readingStartsWith(presetReadingValue(reading), currentChar) &&
    (allowNEnding || readingEnd(presetReadingValue(reading)) !== "ん")
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
