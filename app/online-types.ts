import type { BoardMode } from "./board-generator";
import type { BoardSize, CellObjectionHistory, Panel, Player, RejectedAttempt } from "./game-rules";

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
  winReason: "line" | "draw" | "n-ending" | "final-contested" | null;
  winningLine: number[];
  history: OnlineHistoryItem[];
  /** Optional so rooms created before this field was added remain readable. */
  lastVerdict?: OnlineVerdictEvent | null;
  /** Optional so rooms created before the contested-cell rule remain readable. */
  cellObjections?: CellObjectionHistory;
  retryBlocked: number[];
  rejectedAttempts: RejectedAttempt[];
  seed: number;
  boardSize: BoardSize;
  startingPlayer: Player;
};

export type OnlineSeriesState = {
  matchNumber: number;
  wins: Record<Player, number>;
  draws: number;
  rematchVotes: Partial<Record<Player, true>>;
};

export type OnlineRoomSettings = {
  boardSize: BoardSize;
  startingPlayer: Player;
  objectionLimit: number;
  /** 通常盤面か月替わりEVENT盤面か。旧ルーム互換のため optional。 */
  boardMode?: BoardMode;
  /** EVENT開始時の東京時間の月。連戦中の日付またぎでもテーマを固定する。 */
  eventMonth?: number;
  /** AI戦UIを使いながら、人間が最終決定しAIがセコンドを務めるモード。旧ルーム互換のため optional。 */
  teamMode?: boolean;
};

export type StoredRoom = {
  id: string;
  revision: number;
  status: RoomStatus;
  settings: OnlineRoomSettings;
  players: Record<Player, OnlineParticipant | null>;
  auth: Record<Player, string>;
  game: OnlineGameState;
  /** 同じルームでの連戦状態。旧ルーム互換のため optional。 */
  series?: OnlineSeriesState;
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
  teamMode?: boolean;
  boardMode?: BoardMode;
  eventMonth?: number;
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
  | { type: "rematch" }
  | DeclareAction
  | JudgeAction
  | { type: "close" };

export type CreateRoomResponse = RoomView & {
  accessToken: string;
  inviteToken: string;
};
