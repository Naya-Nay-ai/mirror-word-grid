import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  availablePresetReadings,
  canUseObjection,
  chooseRandomStart,
  findWinner,
  hasCompletableLine,
  hasArtificialPolitePrefix,
  isKanaOnlyReading,
  isContestedCell,
  isLastEmptyCell,
  isRepeatedRejectedReading,
  nextRetryBlocks,
  parseMachineReply,
  presetReadingDisplay,
  presetReadingValue,
  readingEnd,
  readingStartsWith,
  recommendedObjectionCount,
  recordCellObjection,
  resolveDeclaredReading,
  winnerAfterNEnding,
  winLinesFor,
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

test("recommended objection counts follow each board size", () => {
  assert.equal(recommendedObjectionCount(3), 2);
  assert.equal(recommendedObjectionCount(4), 3);
  assert.equal(recommendedObjectionCount(5), 3);
});

test("an objection can be used only once in the opponent's turn", () => {
  assert.equal(canUseObjection(3, false), true);
  assert.equal(canUseObjection(3, true), false);
  assert.equal(canUseObjection(0, false), false);
});

test("contested-cell history is tracked per cell and only activates after both sides object", () => {
  const oneSide = recordCellObjection({}, 3, "O");
  assert.deepEqual(oneSide, { 3: ["O"] });
  assert.equal(isContestedCell(oneSide, 3), false);
  assert.equal(isContestedCell(oneSide, 4), false);

  const bothSides = recordCellObjection(oneSide, 3, "X");
  assert.deepEqual(bothSides, { 3: ["O", "X"] });
  assert.equal(isContestedCell(bothSides, 3), true);
  assert.deepEqual(recordCellObjection(bothSides, 3, "O"), bothSides);
  assert.equal(isLastEmptyCell({ 0: "O", 1: "X", 2: "O" }, 3, 4), true);
  assert.equal(isLastEmptyCell({ 0: "O", 1: "X" }, 3, 4), false);
});

test("formal preset readings can have any array length", () => {
  assert.deepEqual(availablePresetReadings(cat, "ね", false), ["ねこ"]);
});

test("free readings accept kana and reject kanji, latin letters, and numbers", () => {
  for (const reading of ["まるまる", "メリークリスマス", "すーぱー・ねこ", " ぐるぐる！ "]) {
    assert.equal(isKanaOnlyReading(reading), true, reading);
  }
  for (const reading of ["真面目", "まる2つ", "loop", "めがね猫", ""]) {
    assert.equal(isKanaOnlyReading(reading), false, reading);
  }
});

test("kanji display text uses a separate kana reading for all shiritori checks", () => {
  const resolved = resolveDeclaredReading("トッピングにナッツを少々", "とっぴんぐになっつをしょうしょう");
  assert.deepEqual(resolved, {
    display: "トッピングにナッツを少々",
    reading: "とっぴんぐになっつをしょうしょう",
  });
  assert.equal(readingStartsWith(resolved.reading, "と"), true);
  assert.equal(readingEnd(resolved.reading), "う");
  assert.deepEqual(resolveDeclaredReading("トッピングにナッツを少々"), {
    error: "漢字・々・英数字などを使うときは、判定用の読み仮名も入力してね。",
  });
  assert.deepEqual(resolveDeclaredReading("メリークリスマス"), {
    display: "メリークリスマス",
    reading: "メリークリスマス",
  });
});

test("partner replies accept either one copied machine line or exactly one standalone fenced line", () => {
  const line = "【手番:A1｜読み:少々｜読み仮名:しょうしょう｜理由:ナッツを少々｜コード:MWG-ABCDE】";
  const expected = {
    ok: true,
    line,
    fields: { 手番: "A1", 読み: "少々", 読み仮名: "しょうしょう", 理由: "ナッツを少々", コード: "MWG-ABCDE" },
  };
  assert.deepEqual(parseMachineReply(line), expected);
  assert.deepEqual(parseMachineReply(`  ${line}\n`), expected);
  assert.deepEqual(parseMachineReply(`いい手だね！\n\`\`\`\n${line}\n\`\`\``), expected);

  // 本文中に形式らしい行があっても、入力全体がその1行だけでなければ実行しない。
  assert.equal(parseMachineReply(`いい手だね！\n${line}`).ok, false);
  const pastedPrompt = "回答例:\n【判定:受理｜コード:MWG-ABCDE】\n【判定:不成立｜理由:例｜コード:MWG-ABCDE】\n【判定:異議｜理由:例｜コード:MWG-ABCDE】";
  assert.equal(parseMachineReply(pastedPrompt).ok, false);
  const multiple = "```\n【判定:受理｜コード:MWG-ABCDE】\n```\n```\n【判定:異議｜理由:例｜コード:MWG-ABCDE】\n```";
  assert.equal(parseMachineReply(multiple).ok, false);
  assert.equal(parseMachineReply("```\n説明\n【判定:異議｜理由:例｜コード:MWG-ABCDE】\n```").ok, false);
  assert.equal(parseMachineReply("【判定:受理｜コード:MWG-ABCDE】\n【判定:異議｜理由:例｜コード:MWG-ABCDE】").ok, false);
  assert.equal(parseMachineReply("判定:受理｜コード:MWG-ABCDE").ok, false);
});

test("panel dictionary keeps 100 unique, simple emoji cards with editable reading arrays", () => {
  const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
  assert.equal(PANELS.length, 100);
  assert.equal(new Set(PANELS.map((panel) => panel.id)).size, 100);
  assert.equal(new Set(PANELS.map((panel) => panel.icon)).size, 100);
  assert.equal(PANELS.some((panel) => panel.icon.includes("\u200d")), false);
  assert.equal(PANELS.every((panel) => [...segmenter.segment(panel.icon)].length === 1), true);
  assert.equal(PANELS.every((panel) => panel.readings.length > 0), true);
  assert.equal(PANELS.every((panel) => panel.visualDescription.length > 0), true);
});

test("display labels and game readings stay separate for kanji presets", () => {
  const deer = PANELS.find((panel) => panel.id === "deer");
  const preset = deer.readings.find((item) => typeof item === "object" && item.display === "鹿");
  assert.equal(presetReadingDisplay(preset), "鹿");
  assert.equal(presetReadingValue(preset), "しか");
  assert.deepEqual(availablePresetReadings(deer, "し", false).map(presetReadingValue).includes("しか"), true);
});

test("legacy IDs remain stable while the watermelon card safely becomes onigiri", () => {
  assert.equal(PANELS.find((panel) => panel.id === "flying-fish")?.icon, "🐟");
  assert.equal(PANELS.find((panel) => panel.id === "star-bottle")?.icon, "⭐");
  assert.deepEqual(PANELS.find((panel) => panel.id === "watermelon"), {
    id: "watermelon",
    icon: "🍙",
    name: "おにぎり",
    category: "食べ物",
    readings: ["おにぎり", "おむすび", "ライスボール", { display: "握り飯", reading: "にぎりめし" }, { display: "米", reading: "こめ" }],
    visualDescription: "海苔が巻かれた三角形のおにぎり",
  });
});

test("the reviewed plush card uses the teddy bear emoji", () => {
  assert.equal(PANELS.find((panel) => panel.id === "plush")?.icon, "🧸");
});

test("the birthday cake keeps a platform-neutral shared description", () => {
  const birthdayCake = PANELS.find((panel) => panel.id === "birthday-cake");
  assert.equal(birthdayCake?.icon, "🎂");
  assert.equal(birthdayCake?.visualDescription, "飾り付けされたホールケーキ");
  assert.doesNotMatch(birthdayCake?.visualDescription ?? "", /チョコ|ピンク|白(?:い|色)?|茶色/);
});

test("the reviewed infinity card and eleven additional cards are present without changing legacy IDs", () => {
  assert.deepEqual(PANELS.find((panel) => panel.id === "top"), {
    id: "top",
    icon: "♾️",
    name: "無限",
    category: "記号",
    readings: [{ display: "無限大", reading: "むげんだい" }, { display: "メビウスの輪", reading: "メビウスのわ" }, "ぐるぐる", "スパイラル", "ループ"],
    visualDescription: "無限を表す記号",
  });
  const additions = ["microphone", "rabbit", "snow", "salad", "swimmer", "police-car", "jockey", "bath", "scream", "ring", "fire"];
  assert.deepEqual(additions.every((id) => PANELS.some((panel) => panel.id === id)), true);
  assert.equal(PANELS.find((panel) => panel.id === "moon-coffee")?.icon, "☕");
  assert.equal(PANELS.find((panel) => panel.id === "envelope")?.icon, "✉️");
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

test("the opening character is randomly chosen from starts supported by multiple board cards", () => {
  const panel = (id, readings) => ({ id, icon: "◯", name: id, category: "test", readings, visualDescription: id });
  const board = [
    panel("cat", ["ねこ"]),
    panel("sleep", ["ねむり"]),
    panel("umbrella", ["かさ"]),
    panel("frog", ["かえる"]),
    panel("ring", ["ゆびわ"]),
  ];
  assert.equal(chooseRandomStart(board, () => 0), "ね");
  assert.equal(chooseRandomStart(board, () => 0.999), "か");
  assert.notEqual(chooseRandomStart(board, () => 0.5), "ゆ");
});

test("board share state round-trips without mutable game callbacks or chat text", () => {
  const panel = {
    id: "cat",
    icon: "🐱",
    name: "ねこ",
    category: "動物",
    readings: ["ねこ", { display: "茶トラ", reading: "ちゃとら" }],
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
    boardSize: 4,
  };
  const encoded = encodeShareState(state);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeShareState(encoded), state);
  assert.equal(encoded.includes("会話"), false);
});

test("a 5×5 game supports five-card rows, columns, and diagonals", () => {
  assert.equal(winLinesFor(5).length, 12);
  assert.deepEqual(findWinner({ 0: "X", 6: "X", 12: "X", 18: "X", 24: "X" }, 5), {
    winner: "X",
    line: [0, 6, 12, 18, 24],
  });
  assert.deepEqual(findWinner({ 4: "O", 9: "O", 14: "O", 19: "O", 24: "O" }, 5), {
    winner: "O",
    line: [4, 9, 14, 19, 24],
  });
});

test("a 25-card share state round-trips as a 5×5 board", () => {
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
    board: Array.from({ length: 25 }, (_, index) => ({ ...panel, id: `cat-${index}` })),
    claims: Array.from({ length: 25 }, () => ""),
    currentChar: "ね",
    turn: "X",
    objections: [3, 3],
    phase: "partner-turn",
    winner: null,
    winningLine: [],
    retryBlocked: [],
    boardSize: 5,
  };
  assert.deepEqual(decodeShareState(encodeShareState(state)), state);
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

test("the game draws immediately when neither side can complete any line", () => {
  const blockedClaims = {
    0: "O", 1: "O", 2: "X", 3: "X",
    4: "X", 5: "X", 6: "O", 7: "O",
    8: "O", 9: "O", 10: "X", 11: "X",
    12: "X", 13: "X", 14: "O",
  };
  assert.equal(hasCompletableLine(blockedClaims, "O"), false);
  assert.equal(hasCompletableLine(blockedClaims, "X"), false);
  assert.deepEqual(findWinner(blockedClaims), { winner: "DRAW", line: [] });
});

test("line victory takes priority over the draw check", () => {
  const finalLine = {
    0: "O", 1: "O", 2: "O", 3: "O",
    4: "X", 5: "X", 6: "O", 7: "X",
    8: "O", 9: "X", 10: "X", 11: "O",
    12: "X", 13: "O", 14: "X", 15: "X",
  };
  assert.deepEqual(findWinner(finalLine), { winner: "O", line: [0, 1, 2, 3] });
});

test("critical copy, tutorial, and responsive UI hooks remain present", async () => {
  const [page, css, rules] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/game-rules.ts", import.meta.url), "utf8"),
  ]);
  for (const label of [
    "対戦開始文をコピーして始める",
    "この手番をコピー",
    "判定依頼をコピー",
    "返答を盤面へ反映",
    "コピーした文を貼り付ける",
    "【】の返答だけコピーしてゲームへ戻る",
    "対戦スタート文をコピー",
    "みうの返事を受け取ってゲームへ戻る",
    "ゴネを通して👓をGET",
    "AIパートナーを連れて、本番へ！",
    "盤面リンクをコピー",
    "みうの異議を反映",
    "「ん」で終わる読みを出したらその場で負け",
    "「ん」で終わる読みを選ぶと×側の即敗北",
  ]) assert.match(page, new RegExp(label));
  assert.match(page, /読みの正式分類は「正式プリセット」と「自由読み」の2つ/);
  assert.match(page, /双方とも列を完成できなくなった時点で引き分け/);
  assert.match(page, /5 × 5/);
  assert.match(page, /PC／タブレット推奨/);
  assert.match(page, /最初の文字はゲーム開始時にランダム/);
  assert.match(page, /手番コードだけを淡々と返す進行にはしない/);
  assert.match(page, /目の前で一緒に勝負している温度で返す/);
  assert.match(page, /絵文字はOS・端末・AIサービスによって、色・材質・飾り・表情などの細部が違って見える/);
  assert.match(page, /自分側の絵文字と違って見えることだけを理由に「不成立」にしない/);
  assert.match(page, /🎂がチョコ・ピンク・白に見えることも/);
  assert.match(page, /受理されました！/);
  assert.match(page, /showVerdict\("objection", "X"\)/);
  assert.match(page, /showVerdict\("objection", judge\)/);
  assert.match(page, /© 2026 MIRROR ROOM/);
  assert.match(page, /by Nay &amp; Naya/);
  assert.match(page, /1手番につき使える異議は1枚まで/);
  assert.match(page, /🍙「マンモス」/);
  assert.match(css, /\.title-credit/);
  assert.match(css, /\.view-tutorial > \.start-brand \{ display: none; \}/);
  assert.match(css, /\.tutorial-tile\.hint::after/);
  assert.match(rules, /そのコードブロックを含むAIの返答を貼り付けてください。/);
  assert.doesNotMatch(rules, /ChatGPT/);
  assert.doesNotMatch(page, /ん返し|難易度|制限時間|時間無制限|時計停止|EASY|NORMAL|HARD|ゴねり/);
  assert.doesNotMatch(css, /difficulty-picker|\.timer\b/);
  assert.match(page, /id: "cloud", icon: "☁️", name: "くも"/);
  for (const tutorialHook of [
    'id: "umbrella", icon: "☔"',
    'id: "top", icon: "♾️"',
    'id: "glasses", icon: "👓"',
    'id: "crying-face", icon: "😭"',
    'id: "mail", icon: "✉️"',
    'id: "christmas-tree", icon: "🎄"',
    "この自由読みで宣言する",
    "まるが2つあるから！",
    "メガネをかけると真面目そうに見えるから",
    "むむ……！ それなら分かる。今回は受理！",
    "⚡ 異議を出す",
    "✓ 受理する",
    "みうの「メール」を反映",
    "正式読み「ループ」で取る",
    "☔・♾️・👓の上段3マス",
    "しゅがお手本を入力しておいたよ",
    "○側のリーチを見て焦ってる",
    "自由入力のときは必ず、ひらがなかカタカナで入力してね!!",
  ]) assert.match(page, new RegExp(tutorialHook));
  assert.doesNotMatch(page, /ナイト|なつのくだもの/);
  assert.doesNotMatch(page, /まきまき|渦が巻いて見えるから|id: "swirl"|icon: "🌀"/);
  assert.match(css, /\.tutorial-tile\.hint/);
  assert.match(css, /\.tutorial-next-action/);
  for (const chapter of ["基本のしりとり", "ゴネに挑戦！", "異議札を使おう！", "勝ちにいこう！"]) {
    assert.match(page, new RegExp(chapter));
  }
  assert.doesNotMatch(page, /STEP \$\{tutorialStep \+ 1\} \/ \$\{TUTORIAL_TITLES\.length\}/);
  assert.match(page, /✨ ゴネ解禁！ ✨/);
  assert.match(page, /却下されても失敗じゃないよ/);
  assert.match(page, /えっ、そろっちゃう！？/);
  assert.match(page, /負けたーー！ でも、いいゴネだった！/);
  assert.match(page, /\/practice\/\$\{assetKey\}\.webp/);
  assert.match(page, /\/practice\/\$\{assetKey\}\.gif/);
  assert.match(page, /\/practice\/provisional\/shu-neutral\.png/);
  assert.match(page, /\/practice\/provisional\/miu-grumpy\.png/);
  for (const motion of ["point", "explain", "surprise", "cheer", "gone", "ready", "thinking", "accept", "reject", "panic", "shock", "lose"]) {
    assert.match(page, new RegExp(`(?:motion=|motion === |motion-)[^\\n]{0,40}${motion}`));
  }
  assert.match(css, /\.tutorial-coach-guide/);
  assert.match(css, /\.practice-bear-art/);
  assert.match(css, /\.practice-bear-still/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /Chrome \/ Edge readability pass/);
  assert.match(css, /\.tutorial-speech p[\s\S]{0,220}font-size: 15px/);
  assert.match(css, /\.tutorial-gone-form/);
  assert.match(css, /\.tutorial-gone-result/);
  assert.match(css, /@keyframes tutorial-bear-bob/);
  assert.match(page, /じゃあ……これっ！ 『メリークリスマス！』🎄/);
  assert.match(page, /会話全体や説明文はコードブロックに入れない/);
  assert.match(page, /コードブロックの中には機械読取用の1行以外を書かない/);
  assert.doesNotMatch(page, /返答全体をMarkdownのコードブロック1つに入れる/);
  assert.match(css, /\.tutorial-window-layer/);
  assert.match(css, /\.verdict-event/);
  assert.match(css, /\.verdict-player-o/);
  assert.match(css, /\.verdict-player-x/);
  assert.match(css, /@keyframes verdict-card-pop/);
  assert.match(css, /\.emoji-variation-note/);
  assert.match(css, /\.tutorial-chat-window \{ width: min\(760px, 100%\)/);
  assert.match(css, /\.tutorial-judge-actions/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /\.start-shell \{ width: 100%; padding: 0; grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.start-card \{ width: 100%; min-width: 0;/);
  assert.match(css, /@media \(min-width: 901px\)/);
});
