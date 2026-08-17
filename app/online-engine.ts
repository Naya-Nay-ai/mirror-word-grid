import {
  canUseObjection,
  chooseRandomStart,
  findWinner,
  hasArtificialPolitePrefix,
  isContestedCell,
  isLastEmptyCell,
  isRegistered,
  isRepeatedRejectedReading,
  nextRetryBlocks,
  normalizeReading,
  presetReadingDisplay,
  presetReadingValue,
  recordCellObjection,
  readingEnd,
  readingStartsWith,
  recommendedObjectionCount,
  resolveDeclaredReading,
  winnerAfterNEnding,
  type BoardSize,
  type Panel,
  type Player,
} from "./game-rules";
import type {
  DeclareAction,
  OnlineGameState,
  OnlineProposal,
  PlayerProfile,
  RoomAction,
  StoredRoom,
} from "./online-types";
import { PANELS } from "./panel-dictionary";

const SPINES = [
  { ids: ["umbrella", "flying-fish", "eggplant", "watermelon", "frog-prince", "ruby", "dog", "plush", "mirror", "storm"] },
  { ids: ["box-cat", "moon-coffee", "cake", "mushroom", "top", "pillow", "radio", "crown", "mirror", "moon"] },
  { ids: ["moon", "mushroom", "top", "pillow", "radio", "crown", "mirror", "frog-prince", "ruby", "dog"] },
] as const;

const MAX_NAME_LENGTH = 12;
const MAX_DISPLAY_LENGTH = 48;
const MAX_REASON_LENGTH = 240;

export class OnlineGameError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "OnlineGameError";
    this.code = code;
    this.status = status;
  }
}

function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => ((value = (value * 16807) % 2147483647) - 1) / 2147483646;
}

function shuffled<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(random() * (index + 1));
    [result[index], result[nextIndex]] = [result[nextIndex], result[index]];
  }
  return result;
}

export function makeOnlineBoard(seed: number, boardSize: BoardSize) {
  const random = seededRandom(seed);
  const spine = SPINES[Math.floor(random() * SPINES.length)];
  const core = spine.ids.map((id) => PANELS.find((panel) => panel.id === id)).filter((panel): panel is Panel => Boolean(panel));
  const rest = shuffled(PANELS.filter((panel) => !spine.ids.includes(panel.id as never)), random)
    .slice(0, boardSize * boardSize - core.length);
  const board = shuffled([...core, ...rest], random);
  return { board, start: chooseRandomStart(board, random) };
}

export function coordinateForIndex(index: number, boardSize: BoardSize = 4) {
  return `${String.fromCharCode(65 + (index % boardSize))}${Math.floor(index / boardSize) + 1}`;
}

export function indexForCoordinate(value: string, boardSize: BoardSize) {
  const match = value.trim().toUpperCase().match(/^([A-E])([1-5])$/u);
  if (!match) return -1;
  const column = match[1].charCodeAt(0) - 65;
  const row = Number(match[2]) - 1;
  if (column >= boardSize || row >= boardSize) return -1;
  return row * boardSize + column;
}

export function oppositeSide(player: Player): Player {
  return player === "O" ? "X" : "O";
}

export function profileLabel(profile: PlayerProfile | null | undefined) {
  if (!profile) return "参加待ち";
  return profile.partnerName ? `${profile.playerName}＆${profile.partnerName}` : profile.playerName;
}

function compactSingleLine(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[ \t　]+/gu, " ");
}

function validateShortText(value: string, field: string, maxLength: number, required: boolean) {
  if (required && !value) throw new OnlineGameError("invalid_input", `${field}を入力してね。`);
  if (/\r|\n|[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new OnlineGameError("invalid_input", `${field}に改行や制御文字は使えません。`);
  }
  if ([...value].length > maxLength) {
    throw new OnlineGameError("invalid_input", `${field}は${maxLength}文字以内にしてね。`);
  }
  return value;
}

export function normalizeProfile(input: unknown): PlayerProfile {
  if (!input || typeof input !== "object") throw new OnlineGameError("invalid_profile", "プレイヤー情報を確認してね。");
  const source = input as Partial<PlayerProfile>;
  const playerName = validateShortText(compactSingleLine(source.playerName), "プレイヤー名", MAX_NAME_LENGTH, true);
  const partnerName = validateShortText(compactSingleLine(source.partnerName), "AI・相棒名", MAX_NAME_LENGTH, false);
  if (source.controller !== "human" && source.controller !== "ai") {
    throw new OnlineGameError("invalid_profile", "操作担当を選んでね。");
  }
  if (source.controller === "ai" && !partnerName) {
    throw new OnlineGameError("invalid_profile", "AIに手を任せる場合は、AI・相棒名も入力してね。");
  }
  return { playerName, partnerName, controller: source.controller };
}

function normalizeProfileForRoomMode(room: StoredRoom, input: unknown) {
  const mode = room.players.O?.profile.controller;
  if (!mode) throw new OnlineGameError("invalid_room", "対戦モードを確認できませんでした。", 409);
  const source = input && typeof input === "object" ? input as Partial<PlayerProfile> : {};
  return normalizeProfile({
    ...source,
    controller: mode,
    partnerName: mode === "ai" ? source.partnerName : "",
  });
}

export function normalizeBoardSize(value: unknown): BoardSize {
  if (value !== 4 && value !== 5) throw new OnlineGameError("invalid_board_size", "盤面は4×4か5×5を選んでね。");
  return value;
}

export function normalizeObjectionLimit(value: unknown, boardSize: BoardSize) {
  if (value === undefined) return recommendedObjectionCount(boardSize);
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 9) {
    throw new OnlineGameError("invalid_objection_limit", "異議札は0〜9枚で設定してね。");
  }
  return Number(value);
}

export function createOnlineGame(
  seed: number,
  boardSize: BoardSize,
  startingPlayer: Player,
  objectionLimit: number,
  actionCode: string,
): OnlineGameState {
  const { board, start } = makeOnlineBoard(seed, boardSize);
  return {
    board,
    claims: {},
    turn: startingPlayer,
    currentChar: start,
    phase: "select",
    objections: { O: objectionLimit, X: objectionLimit },
    objectionLimit,
    objectionUsedThisTurn: { O: false, X: false },
    actionCode,
    proposal: null,
    winner: null,
    winReason: null,
    winningLine: [],
    history: [],
    lastVerdict: null,
    cellObjections: {},
    retryBlocked: [],
    rejectedAttempts: [],
    seed,
    boardSize,
    startingPlayer,
  };
}

export function proposalLabel(proposal: OnlineProposal) {
  return normalizeReading(proposal.displayReading) === normalizeReading(proposal.reading)
    ? proposal.displayReading
    : `${proposal.displayReading}（${proposal.reading}）`;
}

function assertAiCode(room: StoredRoom, actor: Player, sourceCode?: string) {
  if (room.players[actor]?.profile.controller !== "ai") return;
  if (!sourceCode || sourceCode !== room.game.actionCode) {
    throw new OnlineGameError("stale_ai_reply", "別の手番のAI返答みたい。最新の文章をコピーして、もう一度返答をもらってね。", 409);
  }
}

function validateDeclaration(game: OnlineGameState, action: DeclareAction): OnlineProposal {
  if (!Number.isInteger(action.panelIndex) || action.panelIndex < 0 || action.panelIndex >= game.board.length) {
    throw new OnlineGameError("invalid_panel", "盤面の札を選び直してね。");
  }
  if (game.claims[action.panelIndex]) throw new OnlineGameError("claimed_panel", "その札は取得済みだよ。");
  if (game.retryBlocked.includes(action.panelIndex)) {
    throw new OnlineGameError("blocked_panel", "その札は今回の再試行では選べないよ。別の札を選んでね。");
  }

  const display = validateShortText(compactSingleLine(action.display), "読み", MAX_DISPLAY_LENGTH, true);
  const readingAid = validateShortText(compactSingleLine(action.readingAid), "読み仮名", MAX_DISPLAY_LENGTH, false);
  const resolved = resolveDeclaredReading(display, readingAid);
  if ("error" in resolved) throw new OnlineGameError("invalid_reading", resolved.error);
  const panel = game.board[action.panelIndex];
  const custom = !isRegistered(panel, resolved.reading);
  const reason = validateShortText(compactSingleLine(action.reason), "理由", MAX_REASON_LENGTH, custom);

  if (!readingStartsWith(resolved.reading, game.currentChar)) {
    throw new OnlineGameError("wrong_start", `「${game.currentChar}」から始まる読みを宣言してね。`);
  }
  if (isRepeatedRejectedReading(game.rejectedAttempts, action.panelIndex, resolved.reading)) {
    throw new OnlineGameError("repeated_rejected", "その札と読みの組み合わせは、今回の再試行ではもう使えないよ。");
  }
  if (hasArtificialPolitePrefix(panel, resolved.reading)) {
    throw new OnlineGameError("artificial_prefix", "頭文字合わせだけの「お・ご」付けは使えないよ。");
  }

  return {
    player: game.turn,
    panelIndex: action.panelIndex,
    displayReading: resolved.display,
    reading: resolved.reading,
    reason,
    custom,
  };
}

function applyAcceptedMove(game: OnlineGameState, proposal: OnlineProposal, nextCode: string): OnlineGameState {
  const claims = { ...game.claims, [proposal.panelIndex]: proposal.player };
  const result = findWinner(claims, game.boardSize);
  const nextTurn = oppositeSide(proposal.player);
  return {
    ...game,
    claims,
    turn: nextTurn,
    currentChar: readingEnd(proposal.reading),
    phase: result.winner ? "finished" : "select",
    actionCode: nextCode,
    proposal: null,
    winner: result.winner,
    winReason: result.winner === "DRAW" ? "draw" : result.winner ? "line" : null,
    winningLine: result.line,
    history: [...game.history, {
      player: proposal.player,
      coordinate: coordinateForIndex(proposal.panelIndex, game.boardSize),
      reading: proposalLabel(proposal),
    }],
    retryBlocked: [],
    rejectedAttempts: [],
    objectionUsedThisTurn: { O: false, X: false },
  };
}

function applyNEndingLoss(game: OnlineGameState, proposal: OnlineProposal, nextCode: string): OnlineGameState {
  return {
    ...game,
    phase: "finished",
    actionCode: nextCode,
    proposal: null,
    winner: winnerAfterNEnding(proposal.player),
    winReason: "n-ending",
    winningLine: [],
    history: [...game.history, {
      player: proposal.player,
      coordinate: coordinateForIndex(proposal.panelIndex, game.boardSize),
      reading: proposalLabel(proposal),
    }],
    retryBlocked: [],
    rejectedAttempts: [],
  };
}

function rejectProposal(
  game: OnlineGameState,
  judge: Player,
  kind: "objection" | "not-established",
  nextCode: string,
): OnlineGameState {
  const proposal = game.proposal;
  if (!proposal) throw new OnlineGameError("missing_proposal", "判定待ちの読みがありません。", 409);
  const cellObjections = kind === "objection"
    ? recordCellObjection(game.cellObjections, proposal.panelIndex, judge)
    : game.cellObjections;
  const finalContested = kind === "objection"
    && isContestedCell(cellObjections, proposal.panelIndex)
    && isLastEmptyCell(game.claims, proposal.panelIndex, game.board.length);
  const retryBlocked = nextRetryBlocks(game.claims, game.retryBlocked, proposal.panelIndex, game.board.length);
  return {
    ...game,
    turn: proposal.player,
    phase: finalContested ? "finished" : "select",
    objections: kind === "objection"
      ? { ...game.objections, [judge]: Math.max(0, game.objections[judge] - 1) }
      : game.objections,
    objectionUsedThisTurn: kind === "objection"
      ? { ...game.objectionUsedThisTurn, [judge]: true }
      : game.objectionUsedThisTurn,
    actionCode: nextCode,
    proposal: null,
    winner: finalContested ? "DRAW" : game.winner,
    winReason: finalContested ? "final-contested" : game.winReason,
    winningLine: finalContested ? [] : game.winningLine,
    cellObjections,
    retryBlocked: finalContested ? [] : retryBlocked,
    rejectedAttempts: [...game.rejectedAttempts, {
      panelIndex: proposal.panelIndex,
      reading: normalizeReading(proposal.reading),
    }],
  };
}

function assertActiveRoom(room: StoredRoom) {
  if (room.status !== "active") {
    throw new OnlineGameError("room_not_active", room.status === "finished" ? "この対戦は終了しています。" : "まだ対戦は始まっていません。", 409);
  }
}

export function applyRoomAction(
  room: StoredRoom,
  actor: Player,
  action: RoomAction,
  nowIso: string,
  nextCode: string,
): StoredRoom {
  if (room.status === "closed") throw new OnlineGameError("room_closed", "この部屋は終了しています。", 410);

  if (action.type === "join") {
    if (actor !== "X") throw new OnlineGameError("host_cannot_join", "ホストはすでに参加しています。", 409);
    const profile = normalizeProfileForRoomMode(room, action.profile);
    const existing = room.players.X;
    if (existing) {
      if (JSON.stringify(existing.profile) === JSON.stringify(profile)) return room;
      throw new OnlineGameError("seat_taken", "この招待枠には、すでにプレイヤーが参加しています。", 409);
    }
    if (room.status !== "waiting") throw new OnlineGameError("room_started", "この対戦はすでに始まっています。", 409);
    return { ...room, players: { ...room.players, X: { side: "X", profile, joinedAt: nowIso } } };
  }

  const participant = room.players[actor];
  if (!participant) throw new OnlineGameError("not_joined", "先に対戦部屋へ参加してね。", 409);

  if (action.type === "update-profile") {
    const profile = normalizeProfileForRoomMode(room, action.profile);
    return { ...room, players: { ...room.players, [actor]: { ...participant, profile } } };
  }

  if (action.type === "close") {
    if (actor !== "O") throw new OnlineGameError("host_only", "部屋を終了できるのはホストだけです。", 403);
    return { ...room, status: "closed" };
  }

  if (action.type === "start") {
    if (actor !== "O") throw new OnlineGameError("host_only", "対戦を始められるのはホストだけです。", 403);
    if (room.status !== "waiting") throw new OnlineGameError("already_started", "この対戦はすでに始まっています。", 409);
    if (!room.players.X) throw new OnlineGameError("waiting_for_guest", "相手の参加を待ってね。", 409);
    return { ...room, status: "active", game: { ...room.game, actionCode: nextCode } };
  }

  if (action.type === "declare") {
    assertActiveRoom(room);
    if (room.game.phase !== "select") throw new OnlineGameError("awaiting_judgement", "相手の判定を待ってね。", 409);
    if (room.game.turn !== actor) throw new OnlineGameError("not_your_turn", "いまは相手の手番だよ。", 403);
    assertAiCode(room, actor, action.sourceCode);
    const proposal = validateDeclaration(room.game, action);
    const game = readingEnd(proposal.reading) === "ん"
      ? applyNEndingLoss(room.game, proposal, nextCode)
      : proposal.custom
        ? { ...room.game, phase: "judge" as const, actionCode: nextCode, proposal }
        : applyAcceptedMove(room.game, proposal, nextCode);
    return { ...room, game, status: game.winner ? "finished" : room.status };
  }

  if (action.type === "judge") {
    assertActiveRoom(room);
    const proposal = room.game.proposal;
    if (room.game.phase !== "judge" || !proposal) throw new OnlineGameError("missing_proposal", "判定待ちの読みがありません。", 409);
    if (proposal.player === actor) throw new OnlineGameError("proposer_cannot_judge", "宣言した側は自分の読みを判定できません。", 403);
    assertAiCode(room, actor, action.sourceCode);
    const reason = validateShortText(compactSingleLine(action.reason), "判定理由", MAX_REASON_LENGTH, action.verdict !== "accept");
    void reason;

    let game: OnlineGameState;
    if (action.verdict === "accept") {
      game = applyAcceptedMove(room.game, proposal, nextCode);
      if (!game.winner && action.nextMove) {
        const nextProposal = validateDeclaration(game, { type: "declare", ...action.nextMove });
        game = readingEnd(nextProposal.reading) === "ん"
          ? applyNEndingLoss(game, nextProposal, nextCode)
          : nextProposal.custom
            ? { ...game, phase: "judge" as const, actionCode: nextCode, proposal: nextProposal }
            : applyAcceptedMove(game, nextProposal, nextCode);
      }
    } else if (action.verdict === "objection") {
      if (isContestedCell(room.game.cellObjections, proposal.panelIndex)) {
        throw new OnlineGameError("contested_cell", "このマスは争奪中のため、もう異議は使えません。不成立または受理で判定してね。", 409);
      }
      if (!canUseObjection(room.game.objections[actor], room.game.objectionUsedThisTurn[actor])) {
        throw new OnlineGameError("objection_unavailable", "この相手手番では異議札を使えません。", 409);
      }
      game = rejectProposal(room.game, actor, "objection", nextCode);
    } else if (action.verdict === "not-established") {
      game = rejectProposal(room.game, actor, "not-established", nextCode);
    } else {
      throw new OnlineGameError("invalid_verdict", "判定を選び直してね。");
    }
    game = {
      ...game,
      lastVerdict: {
        code: nextCode,
        verdict: action.verdict,
        judge: actor,
        proposalPlayer: proposal.player,
        reading: proposalLabel(proposal),
      },
    };
    return { ...room, game, status: game.winner ? "finished" : room.status };
  }

  throw new OnlineGameError("unknown_action", "その操作は使えません。");
}

export function presetChoices(panel: Panel, currentChar: string) {
  return panel.readings
    .filter((item) => readingStartsWith(presetReadingValue(item), currentChar))
    .map((item) => ({ display: presetReadingDisplay(item), reading: presetReadingValue(item) }));
}
