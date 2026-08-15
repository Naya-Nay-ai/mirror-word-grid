import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRoomAction,
  createOnlineGame,
  indexForCoordinate,
  normalizeProfile,
  OnlineGameError,
  presetChoices,
  profileLabel,
} from "../app/online-engine.ts";
import { parseAiJudgeReply, parseAiTurnReply } from "../app/online-prompts.ts";

function roomWith(options = {}) {
  const game = createOnlineGame(407, 4, "O", 3, "MWG-FIRST");
  return {
    id: "test-room",
    revision: 0,
    status: "active",
    settings: { boardSize: 4, startingPlayer: "O", objectionLimit: 3 },
    players: {
      O: { side: "O", profile: { playerName: "なや", partnerName: "", controller: "human" }, joinedAt: "2026-01-01T00:00:00.000Z" },
      X: { side: "X", profile: { playerName: "相手", partnerName: "Claude", controller: "ai" }, joinedAt: "2026-01-01T00:00:00.000Z" },
    },
    auth: { O: "a", X: "b" },
    game,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-02T00:00:00.000Z",
    ...options,
  };
}

function matchingPreset(game) {
  for (let index = 0; index < game.board.length; index += 1) {
    const choices = presetChoices(game.board[index], game.currentChar);
    if (choices.length) return { index, ...choices[0] };
  }
  throw new Error("fixture has no matching preset");
}

test("player profiles are compact, bounded, and form the match label", () => {
  const profile = normalizeProfile({ playerName: " なや ", partnerName: " Nay ", controller: "ai" });
  assert.deepEqual(profile, { playerName: "なや", partnerName: "Nay", controller: "ai" });
  assert.equal(profileLabel(profile), "なや＆Nay");
  assert.throws(
    () => normalizeProfile({ playerName: "なや", partnerName: "", controller: "ai" }),
    (error) => error instanceof OnlineGameError && error.code === "invalid_profile",
  );
});

test("online board generation is deterministic and coordinate parsing respects board size", () => {
  const first = createOnlineGame(99, 5, "X", 3, "A");
  const second = createOnlineGame(99, 5, "X", 3, "B");
  assert.deepEqual(first.board.map((panel) => panel.id), second.board.map((panel) => panel.id));
  assert.equal(indexForCoordinate("E5", 5), 24);
  assert.equal(indexForCoordinate("E5", 4), -1);
});

test("a formal reading is accepted by the server without an opponent judgement", () => {
  const room = roomWith();
  const choice = matchingPreset(room.game);
  const next = applyRoomAction(room, "O", {
    type: "declare",
    panelIndex: choice.index,
    display: choice.display,
    readingAid: choice.reading,
  }, "2026-01-01T00:01:00.000Z", "MWG-NEXT");
  assert.equal(next.game.claims[choice.index], "O");
  assert.equal(next.game.turn, "X");
  assert.equal(next.game.phase, "select");
  assert.equal(next.game.actionCode, "MWG-NEXT");
});

test("a free reading waits for the opponent, who can accept it", () => {
  const room = roomWith();
  const panelIndex = 0;
  const display = `${room.game.currentChar}すてき札`;
  const declared = applyRoomAction(room, "O", {
    type: "declare",
    panelIndex,
    display,
    readingAid: `${room.game.currentChar}すてきふだ`,
    reason: "この対戦で札そのものにつけた固定の呼び名だから",
  }, "2026-01-01T00:01:00.000Z", "MWG-JUDGE");
  assert.equal(declared.game.phase, "judge");
  assert.equal(declared.game.proposal?.player, "O");
  assert.throws(
    () => applyRoomAction(declared, "O", { type: "judge", verdict: "accept" }, "2026-01-01T00:02:00.000Z", "MWG-BAD"),
    (error) => error instanceof OnlineGameError && error.code === "proposer_cannot_judge",
  );
  const accepted = applyRoomAction(declared, "X", {
    type: "judge",
    verdict: "accept",
    sourceCode: "MWG-JUDGE",
  }, "2026-01-01T00:02:00.000Z", "MWG-AFTER");
  assert.equal(accepted.game.claims[panelIndex], "O");
  assert.equal(accepted.game.turn, "X");
});

test("an objection consumes one card and blocks the rejected cell for the retry", () => {
  const room = roomWith();
  const declared = applyRoomAction(room, "O", {
    type: "declare",
    panelIndex: 0,
    display: `${room.game.currentChar}すてき札`,
    readingAid: `${room.game.currentChar}すてきふだ`,
    reason: "この対戦で札そのものにつけた固定の呼び名だから",
  }, "2026-01-01T00:01:00.000Z", "MWG-JUDGE");
  const rejected = applyRoomAction(declared, "X", {
    type: "judge",
    verdict: "objection",
    reason: "成立はするが勝ち筋を止めたい",
    sourceCode: "MWG-JUDGE",
  }, "2026-01-01T00:02:00.000Z", "MWG-RETRY");
  assert.equal(rejected.game.objections.X, 2);
  assert.equal(rejected.game.objectionUsedThisTurn.X, true);
  assert.deepEqual(rejected.game.retryBlocked, [0]);
  assert.equal(rejected.game.turn, "O");
});

test("an AI-controlled side must return the current action code", () => {
  const base = roomWith();
  const room = { ...base, game: { ...base.game, turn: "X" } };
  const choice = matchingPreset(room.game);
  assert.throws(
    () => applyRoomAction(room, "X", {
      type: "declare",
      panelIndex: choice.index,
      display: choice.display,
      readingAid: choice.reading,
      sourceCode: "MWG-OLD",
    }, "2026-01-01T00:01:00.000Z", "MWG-NEXT"),
    (error) => error instanceof OnlineGameError && error.code === "stale_ai_reply",
  );
});

test("an n-ending declaration immediately loses without claiming the cell", () => {
  const base = roomWith();
  const room = { ...base, game: { ...base.game, currentChar: "ら" } };
  const result = applyRoomAction(room, "O", {
    type: "declare",
    panelIndex: 0,
    display: "らいおん",
    reason: "この札をライオンに見立てたから",
  }, "2026-01-01T00:01:00.000Z", "MWG-END");
  assert.equal(result.status, "finished");
  assert.equal(result.game.winner, "X");
  assert.equal(result.game.claims[0], undefined);
});

test("AI machine lines parse into revision-safe turn and judgement actions", () => {
  const base = roomWith();
  const room = { ...base, game: { ...base.game, turn: "X" } };
  const turn = parseAiTurnReply(room, "【手番:A1｜読み:かさ｜読み仮名:かさ｜理由:傘だから｜コード:MWG-FIRST】");
  assert.equal(turn.ok, true);
  if (turn.ok) assert.equal(turn.action.sourceCode, "MWG-FIRST");

  const proposalRoom = {
    ...room,
    game: {
      ...room.game,
      phase: "judge",
      proposal: { player: "O", panelIndex: 0, displayReading: "かさ", reading: "かさ", reason: "傘だから", custom: true },
    },
  };
  const judge = parseAiJudgeReply(proposalRoom, "【判定:異議｜理由:ここは止めたい｜コード:MWG-FIRST】");
  assert.deepEqual(judge, { ok: true, action: { type: "judge", verdict: "objection", reason: "ここは止めたい", sourceCode: "MWG-FIRST" } });
});
