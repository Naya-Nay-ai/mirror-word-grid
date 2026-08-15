import assert from "node:assert/strict";
import test from "node:test";

import { resolveRoomStoreCredentials } from "../app/room-store-credentials.ts";

test("custom-prefix Upstash credentials take priority", () => {
  const credentials = resolveRoomStoreCredentials({
    UPSTASH_REDIS_REST_KV_REST_API_URL: "https://prefixed.example",
    UPSTASH_REDIS_REST_KV_REST_API_TOKEN: "prefixed-token",
    UPSTASH_REDIS_REST_URL: "https://standard.example",
    UPSTASH_REDIS_REST_TOKEN: "standard-token",
    KV_REST_API_URL: "https://legacy.example",
    KV_REST_API_TOKEN: "legacy-token",
  });

  assert.deepEqual(credentials, {
    url: "https://prefixed.example",
    token: "prefixed-token",
  });
});

test("an incomplete higher-priority pair cannot mix with fallback credentials", () => {
  const credentials = resolveRoomStoreCredentials({
    UPSTASH_REDIS_REST_KV_REST_API_URL: "https://incomplete.example",
    UPSTASH_REDIS_REST_URL: "https://standard.example",
    UPSTASH_REDIS_REST_TOKEN: "standard-token",
    KV_REST_API_TOKEN: "legacy-token",
  });

  assert.deepEqual(credentials, {
    url: "https://standard.example",
    token: "standard-token",
  });
});

test("legacy Vercel KV credentials remain supported", () => {
  assert.deepEqual(resolveRoomStoreCredentials({
    KV_REST_API_URL: "https://legacy.example",
    KV_REST_API_TOKEN: "legacy-token",
  }), {
    url: "https://legacy.example",
    token: "legacy-token",
  });
});

test("missing complete credential pairs return null", () => {
  assert.equal(resolveRoomStoreCredentials({
    UPSTASH_REDIS_REST_KV_REST_API_URL: "https://incomplete.example",
    KV_REST_API_TOKEN: "orphan-token",
  }), null);
});
