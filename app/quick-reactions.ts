import type { Player } from "./game-rules";

export const QUICK_REACTIONS = [
  { id: "take-it", emoji: "😏", message: "そこ取る？" },
  { id: "objection", emoji: "💢", message: "異議！！" },
  { id: "really", emoji: "😂", message: "それ通るのwww" },
  { id: "please-stop", emoji: "😭", message: "やめてぇ" },
  { id: "nice", emoji: "👏", message: "うまっ" },
  { id: "silence", emoji: "😑", message: "……。" },
  { id: "game-on", emoji: "🔥", message: "勝負じゃ" },
  { id: "want-that", emoji: "🫵", message: "そこ欲しいの知ってる" },
  { id: "approved", emoji: "🤝", message: "それは認める" },
  { id: "yes", emoji: "🎉", message: "よっしゃ！" },
] as const;

export type QuickReactionId = (typeof QUICK_REACTIONS)[number]["id"];

export type QuickReactionEvent = {
  id: string;
  side: Player;
  reactionId: QuickReactionId;
  sentAt: number;
};

export type QuickReactionChannel = {
  events: QuickReactionEvent[];
  lastSentAt: Partial<Record<Player, number>>;
};

export type QuickReactionView = {
  events: QuickReactionEvent[];
  you: Player;
};

export const QUICK_REACTION_COOLDOWN_MS = 1_500;
export const QUICK_REACTION_DISPLAY_MS = 4_500;
export const QUICK_REACTION_CHANNEL_TTL_SECONDS = 10 * 60;

const reactionIds = new Set<string>(QUICK_REACTIONS.map((reaction) => reaction.id));

export function isQuickReactionId(value: unknown): value is QuickReactionId {
  return typeof value === "string" && reactionIds.has(value);
}

export function quickReactionFor(id: QuickReactionId) {
  return QUICK_REACTIONS.find((reaction) => reaction.id === id)!;
}

export function emptyQuickReactionChannel(): QuickReactionChannel {
  return { events: [], lastSentAt: {} };
}

export function appendQuickReaction(
  current: QuickReactionChannel | null,
  event: QuickReactionEvent,
  cooldownMs = QUICK_REACTION_COOLDOWN_MS,
): { accepted: boolean; channel: QuickReactionChannel } {
  const channel = current ?? emptyQuickReactionChannel();
  const previous = channel.lastSentAt[event.side] ?? 0;
  if (event.sentAt - previous < cooldownMs) return { accepted: false, channel };

  return {
    accepted: true,
    channel: {
      events: [...channel.events, event].slice(-2),
      lastSentAt: { ...channel.lastSentAt, [event.side]: event.sentAt },
    },
  };
}
