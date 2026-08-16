type RoomStoreEnvironment = Record<string, string | undefined>;

export function resolveRoomStoreCredentials(environment: RoomStoreEnvironment = process.env) {
  const candidates = [
    {
      url: environment.UPSTASH_REDIS_REST_KV_REST_API_URL,
      token: environment.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
    },
    {
      url: environment.UPSTASH_REDIS_REST_URL,
      token: environment.UPSTASH_REDIS_REST_TOKEN,
    },
    {
      url: environment.KV_REST_API_URL,
      token: environment.KV_REST_API_TOKEN,
    },
  ];

  return candidates.find(
    (candidate): candidate is { url: string; token: string } => Boolean(candidate.url && candidate.token),
  ) ?? null;
}
