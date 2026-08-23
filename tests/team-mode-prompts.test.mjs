import assert from "node:assert/strict";
import test from "node:test";

import { createOnlineGame } from "../app/online-engine.ts";
import { buildAiIntroPrompt, buildAiJudgePrompt, buildAiTurnPrompt } from "../app/online-prompts.ts";

function makeRoom(teamMode) {
  return {
    id: "team-test",
    revision: 0,
    status: "active",
    settings: { boardSize: 4, startingPlayer: "O", objectionLimit: 3, teamMode },
    players: {
      O: { side: "O", profile: { playerName: "なや", partnerName: "ネイ", controller: "ai" }, joinedAt: "2026-08-23T00:00:00.000Z" },
      X: { side: "X", profile: { playerName: "おゆ", partnerName: "律", controller: "ai" }, joinedAt: "2026-08-23T00:00:00.000Z" },
    },
    game: createOnlineGame(407, 4, "O", 3, "MWG-TEAMTEST"),
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
    expiresAt: "2026-08-24T00:00:00.000Z",
  };
}

test("team mode intro makes the AI a second and keeps final authority with the user", () => {
  const prompt = buildAiIntroPrompt(makeRoom(true), "O");
  assert.match(prompt, /AIセコンド/);
  assert.match(prompt, /最終決定権はあなたのユーザー/);
  assert.match(prompt, /最初の相談返答では【手番:…】【判定:…】の機械読取行を出さない/);
});

test("team mode turn prompt requires consultation before the machine line", () => {
  const prompt = buildAiTurnPrompt(makeRoom(true), "O");
  assert.match(prompt, /チーム戦・オンライン手番相談/);
  assert.match(prompt, /最初の返答では、まだ【手番:…】を出さない/);
  assert.match(prompt, /最終決定はユーザー/);
  assert.match(prompt, /ユーザー決定後の形式/);
});

test("normal AI turn prompt still asks the AI to decide immediately", () => {
  const prompt = buildAiTurnPrompt(makeRoom(false), "O");
  assert.match(prompt, /勝つための一手を選び/);
  assert.doesNotMatch(prompt, /最初の返答では、まだ【手番:…】を出さない/);
});

test("team mode judgement prompt waits for the user decision", () => {
  const room = makeRoom(true);
  room.game = {
    ...room.game,
    phase: "judge",
    turn: "X",
    actionCode: "MWG-JUDGETEAM",
    proposal: {
      player: "X",
      panelIndex: 0,
      displayReading: "るーぷしか",
      reading: "るーぷしか",
      reason: "角の形からそう見えるから",
      custom: true,
    },
  };
  const prompt = buildAiJudgePrompt(room, "O");
  assert.match(prompt, /チーム戦・オンライン判定相談/);
  assert.match(prompt, /最初の返答では、まだ【判定:…】を出さない/);
  assert.match(prompt, /推奨判定/);
  assert.match(prompt, /ユーザー決定後に使う形式/);
});
