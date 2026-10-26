import { chooseRandomStart, type BoardSize, type Panel } from "./game-rules";
import { PANELS } from "./panel-dictionary";

export type BoardMode = "normal" | "event";

export type EventTheme = {
  month: number;
  label: string;
  icon: string;
  panelIds: readonly string[];
  seasonalRatio: number;
  availableFrom: string;
};

const NORMAL_SPINES = [
  ["umbrella", "flying-fish", "eggplant", "watermelon", "frog-prince", "ruby", "dog", "plush", "mirror", "storm"],
  ["box-cat", "moon-coffee", "cake", "mushroom", "top", "pillow", "radio", "crown", "mirror", "moon"],
  ["moon", "mushroom", "top", "pillow", "radio", "crown", "mirror", "frog-prince", "ruby", "dog"],
] as const;

const HALLOWEEN_PANEL_IDS = [
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
  "pumpkin",
  "bat",
  "candy",
  "lollipop",
  "spider-web",
  "spider",
  "skull",
  "skull-crossbones",
  "coffin",
  "headstone",
  "crystal-ball",
  "broom",
  "magic-wand",
  "alembic",
  "owl",
  "wolf",
  "cookie",
  "pie",
  "cupcake",
  "corn",
  "fallen-leaf",
  "maple-leaf",
  "performing-arts",
  "full-moon",
  "new-moon",
  "chain",
  "hourglass",
  "old-key",
  "vampire",
  "zombie",
  "mage",
  "fairy",
] as const;

const NOVEMBER_PANEL_IDS = [
  "fallen-leaf",
  "maple-leaf",
  "mushroom",
  "deer",
  "fox-mask",
  "rabbit",
  "owl",
  "wolf",
  "bird",
  "apple",
  "corn",
  "pie",
  "cookie",
  "cupcake",
  "pancake",
  "bread",
  "moon-coffee",
  "teapot",
  "candle",
  "moon",
  "full-moon",
  "star-bottle",
  "book",
  "chair",
  "camera",
  "hat",
  "shoe",
  "dog",
  "box-cat",
  "plush",
  "compass",
  "lantern",
  "fire",
] as const;

const EVENT_THEMES: Partial<Record<number, EventTheme>> = {
  10: {
    month: 10,
    label: "ハロウィン",
    icon: "🎃",
    panelIds: HALLOWEEN_PANEL_IDS,
    seasonalRatio: 0.8,
    availableFrom: "2026-10-01",
  },
  11: {
    month: 11,
    label: "紅葉",
    icon: "🍁",
    panelIds: NOVEMBER_PANEL_IDS,
    seasonalRatio: 0.8,
    availableFrom: "2026-11-01",
  },
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

function panelById(id: string) {
  return PANELS.find((panel) => panel.id === id);
}

function normalBoard(random: () => number, boardSize: BoardSize) {
  const spine = NORMAL_SPINES[Math.floor(random() * NORMAL_SPINES.length)];
  const core = spine.map(panelById).filter((panel): panel is Panel => Boolean(panel));
  const rest = shuffled(PANELS.filter((panel) => !spine.includes(panel.id as never)), random)
    .slice(0, boardSize * boardSize - core.length);
  return shuffled([...core, ...rest], random);
}

function eventBoard(random: () => number, boardSize: BoardSize, theme: EventTheme) {
  const total = boardSize * boardSize;
  const eventIds = new Set(theme.panelIds);
  const eventPool = theme.panelIds.map(panelById).filter((panel): panel is Panel => Boolean(panel));
  const generalPool = PANELS.filter((panel) => !eventIds.has(panel.id));
  const eventCount = Math.min(eventPool.length, Math.ceil(total * theme.seasonalRatio));
  const generalCount = total - eventCount;
  const seasonal = shuffled(eventPool, random).slice(0, eventCount);
  const general = shuffled(generalPool, random).slice(0, generalCount);
  return shuffled([...seasonal, ...general], random);
}

export function currentTokyoMonth(date = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(date));
}

function tokyoDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isEventThemeAvailable(themeOrMonth: EventTheme | number, date = new Date()) {
  const theme = typeof themeOrMonth === "number" ? eventThemeForMonth(themeOrMonth) : themeOrMonth;
  return Boolean(theme && theme.availableFrom <= tokyoDateKey(date));
}

export function availableEventThemes(date = new Date()) {
  return Object.values(EVENT_THEMES)
    .filter((theme): theme is EventTheme => theme !== undefined)
    .filter((theme) => isEventThemeAvailable(theme, date))
    .sort((a, b) => a.availableFrom.localeCompare(b.availableFrom));
}

export function currentEventTheme(date = new Date()) {
  const theme = eventThemeForMonth(currentTokyoMonth(date));
  return theme && isEventThemeAvailable(theme, date) ? theme : null;
}

export function archivedEventThemes(date = new Date()) {
  const current = currentEventTheme(date);
  return availableEventThemes(date).filter((theme) => theme.month !== current?.month);
}

export function upcomingEventThemes(date = new Date()) {
  return Object.values(EVENT_THEMES)
    .filter((theme): theme is EventTheme => theme !== undefined)
    .filter((theme) => !isEventThemeAvailable(theme, date))
    .sort((a, b) => a.availableFrom.localeCompare(b.availableFrom));
}

export function eventThemeForMonth(month: number) {
  return EVENT_THEMES[month] ?? null;
}

export function isEventPanel(panel: Panel, month: number) {
  const theme = eventThemeForMonth(month);
  return Boolean(theme?.panelIds.includes(panel.id));
}

export function makeBoard(
  seed: number,
  boardSize: BoardSize,
  boardMode: BoardMode = "normal",
  eventMonth = currentTokyoMonth(),
) {
  const random = seededRandom(seed);
  const theme = boardMode === "event" ? eventThemeForMonth(eventMonth) : null;
  const board = theme ? eventBoard(random, boardSize, theme) : normalBoard(random, boardSize);
  return {
    board,
    start: chooseRandomStart(board, random),
    eventTheme: theme,
  };
}
