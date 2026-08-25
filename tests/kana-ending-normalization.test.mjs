import assert from "node:assert/strict";
import test from "node:test";

import {
  readingEnd,
  readingStartsWith,
} from "../app/game-rules.ts";

test("small kana endings are normalized to their regular kana", () => {
  assert.equal(readingEnd("かわぃ"), "い");
  assert.equal(readingEnd("にゃ"), "や");
  assert.equal(readingEnd("きっ"), "つ");
  assert.equal(readingEnd("ゕ"), "か");
  assert.equal(readingEnd("ゖ"), "け");
});

test("legacy small-kana current characters still accept normal-kana starts", () => {
  assert.equal(readingStartsWith("いぬ", "ぃ"), true);
  assert.equal(readingStartsWith("ぃぬ", "い"), true);
  assert.equal(readingStartsWith("やま", "ゃ"), true);
  assert.equal(readingStartsWith("つき", "っ"), true);
});

test("prolonged sound mark consistently connects by the preceding sound vowel", () => {
  const cases = new Map([
    ["コーギー", "い"],
    ["ベビー", "い"],
    ["ティー", "い"],
    ["パーティー", "い"],
    ["シュー", "う"],
    ["ショー", "お"],
    ["ファー", "あ"],
    ["チェー", "え"],
    ["ウォー", "お"],
    ["ヴー", "う"],
  ]);

  for (const [reading, expected] of cases) {
    assert.equal(readingEnd(reading), expected, reading);
  }
});

test("repeated prolonged sound marks still resolve from the last actual sound", () => {
  assert.equal(readingEnd("ティーー"), "い");
  assert.equal(readingEnd("シューーー"), "う");
});

test("voiced and semi-voiced start compatibility is preserved after normalization", () => {
  assert.equal(readingStartsWith("ぎんこう", "き"), true);
  assert.equal(readingStartsWith("きのこ", "ぎ"), true);
  assert.equal(readingStartsWith("びわ", "ひ"), true);
  assert.equal(readingStartsWith("ぴあの", "び"), true);
  assert.equal(readingStartsWith("うみ", "ゔ"), true);
});
