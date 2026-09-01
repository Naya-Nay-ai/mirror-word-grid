import type { Player } from "./game-rules";

export const TEAM_CHAT_TEXT_LIMIT = 80;
export const TEAM_CHAT_MAX_MESSAGES = 10;
export const TEAM_CHAT_COOLDOWN_MS = 1_000;
export const TEAM_CHAT_TTL_SECONDS = 24 * 60 * 60;
export const TEAM_CHAT_MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type TeamChatImage = {
  pathname: string;
  contentType: string;
};

export type TeamChatMessage = {
  id: string;
  side: Player;
  text: string;
  sentAt: number;
  image?: TeamChatImage;
};

export type PublicTeamChatMessage = Omit<TeamChatMessage, "image"> & {
  hasImage: boolean;
};

export type TeamChatChannel = {
  messages: TeamChatMessage[];
  lastSentAt: Partial<Record<Player, number>>;
};

export type TeamChatView = {
  messages: PublicTeamChatMessage[];
  you: Player;
  playerNames: Record<Player, string>;
};

export function emptyTeamChatChannel(): TeamChatChannel {
  return { messages: [], lastSentAt: {} };
}

export function publicTeamChatMessage(message: TeamChatMessage): PublicTeamChatMessage {
  const { image, ...rest } = message;
  return { ...rest, hasImage: Boolean(image) };
}

export function appendTeamChat(
  current: TeamChatChannel | null,
  message: TeamChatMessage,
  cooldownMs = TEAM_CHAT_COOLDOWN_MS,
  maxMessages = TEAM_CHAT_MAX_MESSAGES,
): { accepted: boolean; channel: TeamChatChannel; removedImagePathnames: string[] } {
  const channel = current ?? emptyTeamChatChannel();
  const previous = channel.lastSentAt[message.side] ?? 0;
  if (message.sentAt - previous < cooldownMs) {
    return { accepted: false, channel, removedImagePathnames: [] };
  }

  const nextMessages = [...channel.messages, message];
  const removed = nextMessages.slice(0, Math.max(0, nextMessages.length - maxMessages));
  const kept = nextMessages.slice(-maxMessages);

  return {
    accepted: true,
    channel: {
      messages: kept,
      lastSentAt: { ...channel.lastSentAt, [message.side]: message.sentAt },
    },
    removedImagePathnames: removed.flatMap((item) => item.image?.pathname ? [item.image.pathname] : []),
  };
}
