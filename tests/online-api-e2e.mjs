import assert from "node:assert/strict";

import { presetChoices } from "../app/online-engine.ts";

const baseUrl = process.env.MWG_TEST_BASE_URL ?? "http://127.0.0.1:3100";

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

function headers(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

const created = await jsonRequest("/api/rooms", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    profile: { playerName: "ホスト", partnerName: "", controller: "human" },
    boardSize: 4,
    startingPlayer: "O",
  }),
});
assert.equal(created.response.status, 201);
assert.equal(created.body.you, "O");
assert.ok(created.body.accessToken);
assert.ok(created.body.inviteToken);
assert.equal(JSON.stringify(created.body.room).includes('"auth"'), false);

const roomId = created.body.room.id;
const hostToken = created.body.accessToken;
const guestToken = created.body.inviteToken;

const unauthorized = await jsonRequest(`/api/rooms/${roomId}`, { headers: { Authorization: "Bearer not-a-valid-token-value" } });
assert.equal(unauthorized.response.status, 401);

const guestBeforeJoin = await jsonRequest(`/api/rooms/${roomId}`, { headers: { Authorization: `Bearer ${guestToken}` } });
assert.equal(guestBeforeJoin.response.status, 200);
assert.equal(guestBeforeJoin.body.view.you, "X");
assert.equal(guestBeforeJoin.body.view.room.players.X, null);

const joined = await jsonRequest(`/api/rooms/${roomId}`, {
  method: "PATCH",
  headers: headers(guestToken),
  body: JSON.stringify({
    expectedRevision: 0,
    action: { type: "join", profile: { playerName: "ゲスト", partnerName: "", controller: "human" } },
  }),
});
assert.equal(joined.response.status, 200);
assert.equal(joined.body.view.room.revision, 1);
assert.equal(joined.body.view.room.players.X.profile.playerName, "ゲスト");

const started = await jsonRequest(`/api/rooms/${roomId}`, {
  method: "PATCH",
  headers: headers(hostToken),
  body: JSON.stringify({ expectedRevision: 1, action: { type: "start" } }),
});
assert.equal(started.response.status, 200);
assert.equal(started.body.view.room.status, "active");
assert.equal(started.body.view.room.revision, 2);

const game = started.body.view.room.game;
let formal = null;
for (let index = 0; index < game.board.length && !formal; index += 1) {
  const [choice] = presetChoices(game.board[index], game.currentChar);
  if (choice) formal = { index, ...choice };
}
assert.ok(formal);

const formalMove = await jsonRequest(`/api/rooms/${roomId}`, {
  method: "PATCH",
  headers: headers(hostToken),
  body: JSON.stringify({
    expectedRevision: 2,
    action: { type: "declare", panelIndex: formal.index, display: formal.display, readingAid: formal.reading },
  }),
});
assert.equal(formalMove.response.status, 200);
assert.equal(formalMove.body.view.room.game.claims[formal.index], "O");
assert.equal(formalMove.body.view.room.game.turn, "X");

const staleWrite = await jsonRequest(`/api/rooms/${roomId}`, {
  method: "PATCH",
  headers: headers(guestToken),
  body: JSON.stringify({ expectedRevision: 2, action: { type: "declare", panelIndex: 1, display: "てすと", reason: "テスト" } }),
});
assert.equal(staleWrite.response.status, 409);
assert.equal(staleWrite.body.error.code, "revision_conflict");
assert.equal(staleWrite.body.view.room.revision, 3);

const current = formalMove.body.view.room.game;
const customIndex = current.board.findIndex((_, index) => !current.claims[index]);
const customReading = `${current.currentChar}すてきふだ`;
const customMove = await jsonRequest(`/api/rooms/${roomId}`, {
  method: "PATCH",
  headers: headers(guestToken),
  body: JSON.stringify({
    expectedRevision: 3,
    action: { type: "declare", panelIndex: customIndex, display: customReading, reason: "この対戦で札そのものにつけた呼び名だから" },
  }),
});
assert.equal(customMove.response.status, 200);
assert.equal(customMove.body.view.room.game.phase, "judge");
assert.equal(customMove.body.view.room.game.proposal.player, "X");

const accepted = await jsonRequest(`/api/rooms/${roomId}`, {
  method: "PATCH",
  headers: headers(hostToken),
  body: JSON.stringify({ expectedRevision: 4, action: { type: "judge", verdict: "accept" } }),
});
assert.equal(accepted.response.status, 200);
assert.equal(accepted.body.view.room.game.claims[customIndex], "X");
assert.equal(accepted.body.view.room.game.phase, "select");
assert.ok(Date.parse(accepted.body.view.room.expiresAt) > Date.now() + 23 * 60 * 60 * 1000);

console.log(JSON.stringify({
  ok: true,
  roomId,
  finalRevision: accepted.body.view.room.revision,
  verified: ["create", "auth", "join", "start", "formal move", "revision conflict", "free-reading judgement", "ttl refresh"],
}, null, 2));
