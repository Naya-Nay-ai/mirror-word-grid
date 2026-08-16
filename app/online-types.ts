import type { BoardSize, Panel, Player, RejectedAttempt } from "./game-rules";

export type ControllerKind = "human" | "ai";
export type RoomStatus = "waiting" | "active" | "finished" | "closed";
export type OnlinePhase = "select" | "judge" | "finished";

export type PlayerProfile = {
  playerName: string;
  partnerName: string;
  controller: ControllerKind;
};

export type OnlineParticipant = {
  side: Player;
  profile: PlayerProfile;
  joinedAt: string;
};

export type OnlineProposal = {
  player: Player;
  panelIndex: number;
  displayReading: string;
  reading: string;
  reason: string;
  custom: boolean;
};

export type OnlineHistoryItem = {
  player: Player;
  coordinate: string;
  reading: string;
};

export type OnlineVerdictEvent = {
  code: string;
  verdict: "accept" | "objection" | "not-established";
  judge: Player;
  proposalPlayer: Player;
  reading: string;
};

export type OnlineGameState = {
  board: Panel[];
  claims: Record<number, Player>;
  turn: Player;
  currentChar: string;
  phase: OnlinePhase;
  objections: Record<Player, number>;
  objectionLimit: number;
  objectionUsedThisTurn: Record<Player, boolean>;
  actionCode: string;
  proposal: OnlineProposal | null;
  winner: Player | "DRAW" | null;
  winReason: "line" | "draw" | "n-ending" | null;
  winningLine: number[];
  history: OnlineHistoryItem[];
  /** Optional so rooms created before this field was added remain readable. */
  lastVerdict?: OnlineVerdictEvent | null;
  retryBlocked: number[];
  rejectedAttempts: RejectedAttempt[];
  seed: number;
  boardSize: BoardSize;
  startingPlayer: Player;
};

export type OnlineRoomSettings = {
  boardSize: BoardSize;
  startingPlayer: Player;
  objectionLimit: number;
};

export type StoredRoom = {
  id: string;
  revision: number;
  status: RoomStatus;
  settings: OnlineRoomSettings;
  players: Record<Player, OnlineParticipant | null>;
  auth: Record<Player, string>;
  game: OnlineGameState;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type PublicRoom = Omit<StoredRoom, "auth">;

export type RoomView = {
  room: PublicRoom;
  you: Player;
};

export type CreateRoomInput = {
  profile: PlayerProfile;
  boardSize: BoardSize;
  startingPlayer?: Player | "random";
  objectionLimit?: number;
};

export type DeclareAction = {
  type: "declare";
  panelIndex: number;
  display: string;
  readingAid?: string;
  reason?: string;
  sourceCode?: string;
};

export type JudgeAction = {
  type: "judge";
  verdict: "accept" | "objection" | "not-established";
  reason?: string;
  sourceCode?: string;
  /** AI判定で受理した直後の一手を、通常戦と同じ1往復でまとめて反映する。 */
  nextMove?: {
    panelIndex: number;
    display: string;
    readingAid?: string;
    reason?: string;
  };
};

export type RoomAction =
  | { type: "join"; profile: PlayerProfile }
  | { type: "update-profile"; profile: PlayerProfile }
  | { type: "start" }
  | DeclareAction
  | JudgeAction
  | { type: "close" };

export type CreateRoomResponse = RoomView & {
  accessToken: string;
  inviteToken: string;
};
