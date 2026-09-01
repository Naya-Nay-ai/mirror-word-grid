import assert from "node:assert/strict";
import test from "node:test";

import {
  appendTeamChat,
  emptyTeamChatChannel,
  TEAM_CHAT_MAX_MESSAGES,
} from "../app/team-chat.ts";

function message(id, side, sentAt, imagePathname) {
  return {
    id,
    side,
    text: id,
    sentAt,
    ...(imagePathname ? { image: { pathname: imagePathname, contentType: "image/webp" } } : {}),
  };
}

test("team chat enforces per-side cooldown", () => {
  const first = appendTeamChat(emptyTeamChatChannel(), message("a", "O", 1_000), 1_000);
  assert.equal(first.accepted, true);
  const tooSoon = appendTeamChat(first.channel, message("b", "O", 1_500), 1_000);
  assert.equal(tooSoon.accepted, false);
  assert.equal(tooSoon.channel.messages.length, 1);
  const otherSide = appendTeamChat(first.channel, message("c", "X", 1_500), 1_000);
  assert.equal(otherSide.accepted, true);
});

test("team chat keeps only the latest messages and reports removed image paths", () => {
  let channel = emptyTeamChatChannel();
  let removed = [];
  for (let index = 0; index < TEAM_CHAT_MAX_MESSAGES + 2; index += 1) {
    const result = appendTeamChat(
      channel,
      message(`m-${index}`, index % 2 === 0 ? "O" : "X", 2_000 + index * 2_000, index === 0 ? "old.webp" : undefined),
      0,
    );
    channel = result.channel;
    removed = [...removed, ...result.removedImagePathnames];
  }
  assert.equal(channel.messages.length, TEAM_CHAT_MAX_MESSAGES);
  assert.equal(channel.messages[0].id, "m-2");
  assert.deepEqual(removed, ["old.webp"]);
});
