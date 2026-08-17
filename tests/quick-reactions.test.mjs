import assert from "node:assert/strict";
import test from "node:test";

import {
  appendQuickReaction,
  isQuickReactionId,
  QUICK_REACTIONS,
} from "../app/quick-reactions.ts";

function event(id, side, reactionId, sentAt) {
  return { id, side, reactionId, sentAt };
}

test("quick-reaction catalog is compact and identifiers are validated", () => {
  assert.equal(QUICK_REACTIONS.length, 10);
  assert.equal(new Set(QUICK_REACTIONS.map((reaction) => reaction.id)).size, QUICK_REACTIONS.length);
  assert.equal(isQuickReactionId("really"), true);
  assert.equal(isQuickReactionId("free-form-message"), false);
});

test("cooldown applies per side without blocking the opponent", () => {
  const first = appendQuickReaction(null, event("one", "O", "nice", 10_000), 1_500);
  assert.equal(first.accepted, true);

  const spam = appendQuickReaction(first.channel, event("two", "O", "yes", 11_499), 1_500);
  assert.equal(spam.accepted, false);
  assert.deepEqual(spam.channel.events.map((item) => item.id), ["one"]);

  const opponent = appendQuickReaction(first.channel, event("three", "X", "objection", 11_000), 1_500);
  assert.equal(opponent.accepted, true);
  assert.deepEqual(opponent.channel.events.map((item) => item.id), ["one", "three"]);
});

test("only the latest two reactions remain in the lightweight channel", () => {
  const first = appendQuickReaction(null, event("one", "O", "nice", 10_000), 1_500);
  const second = appendQuickReaction(first.channel, event("two", "X", "really", 10_100), 1_500);
  const third = appendQuickReaction(second.channel, event("three", "O", "yes", 11_500), 1_500);

  assert.equal(third.accepted, true);
  assert.deepEqual(third.channel.events.map((item) => item.id), ["two", "three"]);
});
