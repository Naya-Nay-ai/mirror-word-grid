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
import { eventThemeForMonth } from "../app/board-generator.ts";

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
    if (game.claims[index]) continue;
    const choices = presetChoices(game.board[index], game.currentChar);
    if (choices.length) return { index, ...choices[0] };
  }
  throw new Error("fixture has no matching preset");
}

function laterTurn(room, turn, currentChar = "か") {
  return {
    ...room,
    status: "active",
    game: {
      ...room.game,
      turn,
      currentChar,
      phase: "select",
      proposal: null,
      winner: null,
      winReason: null,
      winningLine: [],
      retryBlocked: [],
      rejectedAttempts: [],
      objectionUsedThisTurn: { O: false, X: false },
    },
  };
}

function declareCustom(room, actor, panelIndex, nextCode) {
  return applyRoomAction(room, actor, {
    type: "declare",
    panelIndex,
    display: `${room.game.currentChar}すてき札`,
    readingAid: `${room.game.currentChar}すてきふだ`,
    reason: "この対戦で札そのものにつけた固定の呼び名だから",
    sourceCode: room.game.actionCode,
  }, "2026-01-01T00:01:00.000Z", nextCode);
}

function objectTo(room, actor, nextCode) {
  return applyRoomAction(room, actor, {
    type: "judge",
    verdict: "objection",
    reason: "成立はするが勝ち筋を止めたい",
    sourceCode: room.game.actionCode,
  }, "2026-01-01T00:02:00.000Z", nextCode);
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

test("the host mode is authoritative when the invited player joins", () => {
  const aiRoom = roomWith({
    status: "waiting",
    players: {
      O: { side: "O", profile: { playerName: "ホスト", partnerName: "ホームAI", controller: "ai" }, joinedAt: "2026-01-01T00:00:00.000Z" },
      X: null,
    },
  });
  const aiJoined = applyRoomAction(aiRoom, "X", {
    type: "join",
    profile: { playerName: "ゲスト", partnerName: "相棒AI", controller: "human" },
  }, "2026-01-01T00:01:00.000Z", "MWG-NEXT");
  assert.deepEqual(aiJoined.players.X?.profile, { playerName: "ゲスト", partnerName: "相棒AI", controller: "ai" });

  const humanRoom = roomWith({ status: "waiting", players: { ...roomWith().players, X: null } });
  const humanJoined = applyRoomAction(humanRoom, "X", {
    type: "join",
    profile: { playerName: "ゲスト", partnerName: "送信されても消えるAI名", controller: "ai" },
  }, "2026-01-01T00:01:00.000Z", "MWG-NEXT");
  assert.deepEqual(humanJoined.players.X?.profile, { playerName: "ゲスト", partnerName: "", controller: "human" });
});

test("online board generation is deterministic and coordinate parsing respects board size", () => {
  const first = createOnlineGame(99, 5, "X", 3, "A");
  const second = createOnlineGame(99, 5, "X", 3, "B");
  assert.deepEqual(first.board.map((panel) => panel.id), second.board.map((panel) => panel.id));
  assert.equal(indexForCoordinate("E5", 5), 24);
  assert.equal(indexForCoordinate("E5", 4), -1);
});

test("online EVENT boards keep the October ratio and remain deterministic", () => {
  const first = createOnlineGame(202610, 4, "O", 3, "EVENT-A", "event", 10);
  const second = createOnlineGame(202610, 4, "O", 3, "EVENT-B", "event", 10);
  const theme = eventThemeForMonth(10);
  const themedIds = new Set(theme.panelIds);

  assert.deepEqual(first.board.map((panel) => panel.id), second.board.map((panel) => panel.id));
  assert.equal(first.board.filter((panel) => themedIds.has(panel.id)).length, 13);
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
  assert.deepEqual(accepted.game.lastVerdict, {
    code: "MWG-AFTER",
    verdict: "accept",
    judge: "X",
    proposalPlayer: "O",
    reading: `${display}（${room.game.currentChar}すてきふだ）`,
  });
});

test("an AI can accept a free reading and propose its next move in the same revision", () => {
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
  const acceptedOnly = applyRoomAction(declared, "X", {
    type: "judge",
    verdict: "accept",
    sourceCode: "MWG-JUDGE",
  }, "2026-01-01T00:02:00.000Z", "MWG-PREVIEW");
  const nextPanelIndex = acceptedOnly.game.board.findIndex((_, index) => !acceptedOnly.game.claims[index]);
  const nextDisplay = `${acceptedOnly.game.currentChar}すてきな札`;
  const nextReading = `${acceptedOnly.game.currentChar}すてきなふだ`;

  const combined = applyRoomAction(declared, "X", {
    type: "judge",
    verdict: "accept",
    sourceCode: "MWG-JUDGE",
    nextMove: {
      panelIndex: nextPanelIndex,
      display: nextDisplay,
      readingAid: nextReading,
      reason: "次の一手も同時に返す",
    },
  }, "2026-01-01T00:02:00.000Z", "MWG-COMBINED");

  assert.equal(combined.game.claims[panelIndex], "O");
  assert.equal(combined.game.phase, "judge");
  assert.equal(combined.game.proposal?.player, "X");
  assert.equal(combined.game.proposal?.panelIndex, nextPanelIndex);
  assert.equal(combined.game.history.length, 1);
  assert.equal(combined.game.turn, "X");
  assert.equal(combined.game.lastVerdict?.verdict, "accept");
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
  assert.deepEqual(rejected.game.cellObjections, { 0: ["X"] });
});

test("one-sided cell objection stays ordinary; both sides make only that cell contested", () => {
  const firstDeclared = declareCustom(laterTurn(roomWith(), "O"), "O", 0, "MWG-FIRST-JUDGE");
  const firstRejected = objectTo(firstDeclared, "X", "MWG-FIRST-RETRY");
  assert.deepEqual(firstRejected.game.cellObjections, { 0: ["X"] });
  assert.equal(firstRejected.game.winner, null);

  const returnDeclared = declareCustom(laterTurn(firstRejected, "X"), "X", 0, "MWG-RETURN-JUDGE");
  const contested = objectTo(returnDeclared, "O", "MWG-CONTESTED");
  assert.deepEqual(contested.game.cellObjections, { 0: ["X", "O"] });
  assert.equal(contested.game.winner, null);

  const sameCellAgain = declareCustom(laterTurn(contested, "O"), "O", 0, "MWG-SAME-JUDGE");
  assert.throws(
    () => objectTo(sameCellAgain, "X", "MWG-BLOCKED-OBJECTION"),
    (error) => error instanceof OnlineGameError && error.code === "contested_cell",
  );

  const otherCell = declareCustom(laterTurn(contested, "O"), "O", 1, "MWG-OTHER-JUDGE");
  const otherRejected = objectTo(otherCell, "X", "MWG-OTHER-RETRY");
  assert.deepEqual(otherRejected.game.cellObjections?.[1], ["X"]);
  assert.equal(otherRejected.game.objections.X, 1);
});

test("a contested cell still obeys not-established and fixed machine rules", () => {
  const history = { 0: ["O", "X"] };
  const base = roomWith();
  const contestedRoom = laterTurn({ ...base, game: { ...base.game, cellObjections: history } }, "O", "か");

  assert.throws(
    () => applyRoomAction(contestedRoom, "O", {
      type: "declare",
      panelIndex: 0,
      display: "さかな",
      reason: "魚に見立てた",
    }, "2026-01-01T00:01:00.000Z", "MWG-WRONG"),
    (error) => error instanceof OnlineGameError && error.code === "wrong_start",
  );

  const declared = declareCustom(contestedRoom, "O", 0, "MWG-NOT-JUDGE");
  const notEstablished = applyRoomAction(declared, "X", {
    type: "judge",
    verdict: "not-established",
    reason: "札との意味的なつながりが遠い",
    sourceCode: declared.game.actionCode,
  }, "2026-01-01T00:02:00.000Z", "MWG-NOT-RETRY");
  assert.equal(notEstablished.game.phase, "select");
  assert.equal(notEstablished.game.objections.X, 3);
  assert.deepEqual(notEstablished.game.cellObjections, history);
  assert.deepEqual(notEstablished.game.retryBlocked, [0]);
});

test("the last empty cell continues after one objection and draws after both sides object", () => {
  const claims = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [index, "X"]));
  claims[0] = "O";
  claims[5] = "O";
  claims[10] = "O";
  const base = roomWith();
  const lastCellRoom = laterTurn({ ...base, game: { ...base.game, claims } }, "O", "か");

  const firstDeclared = declareCustom(lastCellRoom, "O", 15, "MWG-LAST-FIRST-JUDGE");
  const oneSide = objectTo(firstDeclared, "X", "MWG-LAST-FIRST-RETRY");
  assert.equal(oneSide.status, "active");
  assert.equal(oneSide.game.winner, null);
  assert.deepEqual(oneSide.game.cellObjections, { 15: ["X"] });

  const returnDeclared = declareCustom(laterTurn(oneSide, "X"), "X", 15, "MWG-LAST-RETURN-JUDGE");
  const finalDraw = objectTo(returnDeclared, "O", "MWG-FINAL-CONTESTED");
  assert.equal(finalDraw.status, "finished");
  assert.equal(finalDraw.game.phase, "finished");
  assert.equal(finalDraw.game.winner, "DRAW");
  assert.equal(finalDraw.game.winReason, "final-contested");
  assert.deepEqual(finalDraw.game.cellObjections, { 15: ["X", "O"] });
  assert.equal(finalDraw.game.objections.O, 2);
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

test("same-room rematch waits for both players, keeps the room, and starts a fresh board", () => {
  const base = roomWith();
  const finished = {
    ...base,
    status: "finished",
    series: { matchNumber: 1, wins: { O: 1, X: 0 }, draws: 0, rematchVotes: {} },
    game: {
      ...base.game,
      phase: "finished",
      winner: "O",
      winReason: "line",
      winningLine: [0, 1, 2, 3],
      claims: { 0: "O", 1: "O", 2: "O", 3: "O" },
    },
  };

  const requested = applyRoomAction(
    finished,
    "O",
    { type: "rematch" },
    "2026-01-01T00:05:00.000Z",
    "MWG-WAITING",
    12345,
  );
  assert.equal(requested.id, finished.id);
  assert.equal(requested.status, "finished");
  assert.deepEqual(requested.series?.rematchVotes, { O: true });
  assert.equal(requested.series?.matchNumber, 1);

  const restarted = applyRoomAction(
    requested,
    "X",
    { type: "rematch" },
    "2026-01-01T00:06:00.000Z",
    "MWG-REMATCH",
    54321,
  );
  assert.equal(restarted.id, finished.id);
  assert.equal(restarted.status, "active");
  assert.equal(restarted.series?.matchNumber, 2);
  assert.deepEqual(restarted.series?.wins, { O: 1, X: 0 });
  assert.deepEqual(restarted.series?.rematchVotes, {});
  assert.equal(restarted.game.seed, 54321);
  assert.equal(restarted.game.startingPlayer, "X");
  assert.equal(restarted.settings.startingPlayer, "X");
  assert.equal(restarted.game.turn, "X");
  assert.equal(restarted.game.winner, null);
  assert.deepEqual(restarted.game.claims, {});
  assert.equal(restarted.game.actionCode, "MWG-REMATCH");
});

test("same-room EVENT rematch keeps its original event month", () => {
  const base = roomWith();
  const eventGame = createOnlineGame(202610, 4, "O", 3, "MWG-EVENT", "event", 10);
  const finished = {
    ...base,
    status: "finished",
    settings: { ...base.settings, boardMode: "event", eventMonth: 10 },
    series: { matchNumber: 1, wins: { O: 1, X: 0 }, draws: 0, rematchVotes: {} },
    game: { ...eventGame, phase: "finished", winner: "O", winReason: "line", winningLine: [0, 1, 2, 3] },
  };
  const requested = applyRoomAction(finished, "O", { type: "rematch" }, "2026-11-01T00:05:00.000Z", "WAIT", 7001);
  const restarted = applyRoomAction(requested, "X", { type: "rematch" }, "2026-11-01T00:06:00.000Z", "NEXT", 7002);
  const themeIds = new Set(eventThemeForMonth(10).panelIds);

  assert.equal(restarted.settings.boardMode, "event");
  assert.equal(restarted.settings.eventMonth, 10);
  assert.equal(restarted.game.board.filter((panel) => themeIds.has(panel.id)).length, 13);
});

test("legacy finished rooms can enter rematch without losing the completed result", () => {
  const base = roomWith();
  const legacyFinished = {
    ...base,
    status: "finished",
    game: { ...base.game, phase: "finished", winner: "DRAW", winReason: "draw" },
  };
  const requested = applyRoomAction(
    legacyFinished,
    "O",
    { type: "rematch" },
    "2026-01-01T00:05:00.000Z",
    "MWG-WAITING",
    12345,
  );
  assert.equal(requested.series?.draws, 1);
  assert.equal(requested.series?.matchNumber, 1);
  assert.deepEqual(requested.series?.rematchVotes, { O: true });
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

  const contestedProposalRoom = {
    ...proposalRoom,
    game: { ...proposalRoom.game, cellObjections: { 0: ["O", "X"] } },
  };
  const contestedJudge = parseAiJudgeReply(contestedProposalRoom, "【判定:異議｜理由:ここは止めたい｜コード:MWG-FIRST】");
  assert.equal(contestedJudge.ok, false);
  if (!contestedJudge.ok) assert.match(contestedJudge.error, /争奪中/u);

  const accepted = parseAiJudgeReply(proposalRoom, "【判定:受理｜次手:B2｜読み:さかな｜読み仮名:さかな｜理由:魚だから｜コード:MWG-FIRST】");
  assert.deepEqual(accepted, {
    ok: true,
    action: {
      type: "judge",
      verdict: "accept",
      sourceCode: "MWG-FIRST",
      nextMove: { panelIndex: 5, display: "さかな", readingAid: "さかな", reason: "魚だから" },
    },
  });
});
