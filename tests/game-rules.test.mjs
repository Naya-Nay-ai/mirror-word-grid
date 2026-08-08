import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  availablePresetReadings,
  findWinner,
  hasArtificialPolitePrefix,
  isRepeatedRejectedReading,
  nextRetryBlocks,
  readingStartsWith,
  winnerAfterNEnding,
} from "../app/game-rules.ts";
import { decodeShareState, encodeShareState } from "../app/share-state.ts";
import { PANELS } from "../app/panel-dictionary.ts";

const cat = {
  id: "cat",
  icon: "🐱",
  name: "ねこ",
  category: "動物",
  readings: ["ねこ", "おうちねこ"],
  visualDescription: "猫の顔",
};

test("formal preset readings can have any array length", () => {
  assert.deepEqual(availablePresetReadings(cat, "ね", false), ["ねこ"]);
});

test("panel dictionary keeps 48 unique, simple emoji cards with editable reading arrays", () => {
  const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
  assert.equal(PANELS.length, 48);
  assert.equal(new Set(PANELS.map((panel) => panel.id)).size, 48);
  assert.equal(new Set(PANELS.map((panel) => panel.icon)).size, 48);
  assert.equal(PANELS.some((panel) => panel.icon.includes("\u200d")), false);
  assert.equal(PANELS.every((panel) => [...segmenter.segment(panel.icon)].length === 1), true);
  assert.equal(PANELS.every((panel) => panel.readings.length > 0), true);
  assert.equal(PANELS.every((panel) => panel.visualDescription.length > 0), true);
});

test("artificial polite prefixes are rejected but formal readings are preserved", () => {
  assert.equal(hasArtificialPolitePrefix(cat, "おねこ"), true);
  assert.equal(hasArtificialPolitePrefix(cat, "おうちねこ"), false);
});

test("rejected reading is scoped to the same cell and same normalized reading", () => {
  const attempts = [{ panelIndex: 3, reading: "ないと" }];
  assert.equal(isRepeatedRejectedReading(attempts, 3, "ナイト"), true);
  assert.equal(isRepeatedRejectedReading(attempts, 4, "ナイト"), false);
});

test("retry blocking releases all cells instead of deadlocking the final empty cell", () => {
  const claims = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [index, index % 2 ? "X" : "O"]));
  assert.deepEqual(nextRetryBlocks(claims, [], 15, 16), []);
});

test("retry blocking stays temporary while another empty cell is available", () => {
  const claims = Object.fromEntries(Array.from({ length: 14 }, (_, index) => [index, index % 2 ? "X" : "O"]));
  assert.deepEqual(nextRetryBlocks(claims, [], 14, 16), [14]);
});

test("current provisional voiced-kana connection remains unchanged", () => {
  assert.equal(readingStartsWith("がっき", "か"), true);
  assert.equal(readingStartsWith("ぱん", "ば"), true);
});

test("an n-ending declaration immediately awards the game to the opponent", () => {
  assert.equal(winnerAfterNEnding("O"), "X");
  assert.equal(winnerAfterNEnding("X"), "O");
});

test("board share state round-trips without mutable game callbacks or chat text", () => {
  const panel = {
    id: "cat",
    icon: "🐱",
    name: "ねこ",
    category: "動物",
    readings: ["ねこ"],
    visualDescription: "猫の顔",
  };
  const state = {
    v: 1,
    board: Array.from({ length: 16 }, (_, index) => ({ ...panel, id: `cat-${index}` })),
    claims: Array.from({ length: 16 }, (_, index) => index === 0 ? "O" : index === 1 ? "X" : ""),
    currentChar: "こ",
    turn: "O",
    objections: [2, 1],
    phase: "select",
    winner: null,
    winningLine: [],
    retryBlocked: [4],
  };
  const encoded = encodeShareState(state);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeShareState(encoded), state);
  assert.equal(encoded.includes("会話"), false);
});

test("a 4×4 game reaches line victory and a full non-line board reaches draw", () => {
  assert.deepEqual(findWinner({ 0: "O", 5: "O", 10: "O", 15: "O" }), {
    winner: "O",
    line: [0, 5, 10, 15],
  });
  const drawClaims = {
    0: "O", 1: "O", 2: "X", 3: "X",
    4: "X", 5: "X", 6: "O", 7: "O",
    8: "O", 9: "O", 10: "X", 11: "X",
    12: "X", 13: "X", 14: "O", 15: "O",
  };
  assert.deepEqual(findWinner(drawClaims), { winner: "DRAW", line: [] });
});

test("critical copy, tutorial, and responsive UI hooks remain present", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const label of [
    "対戦開始文をコピーして始める",
    "この手番をコピー",
    "判定依頼をコピー",
    "返答を盤面へ反映",
    "盤面リンクをコピー",
    "みうの異議を反映",
    "この読みを出すと負け！",
    "「ん」で終わる読みを選ぶと×側の即敗北",
  ]) assert.match(page, new RegExp(label));
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /@media \(min-width: 901px\)/);
});
