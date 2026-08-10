import type { Panel, Player } from "./game-rules";

export type SharedPhase = "select" | "reading" | "partner-turn" | "partner-judge" | "local-judge" | "player-judge";

export type SharePanel = Pick<Panel, "id" | "icon" | "name" | "category" | "readings" | "visualDescription">;

export type ShareState = {
  v: 1;
  board: SharePanel[];
  claims: Array<Player | "">;
  currentChar: string;
  turn: Player;
  objections: [number, number];
  phase: SharedPhase;
  winner: Player | "DRAW" | null;
  winningLine: number[];
  retryBlocked: number[];
};

export function encodeShareState(payload: ShareState) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeShareState(value: string): ShareState | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<ShareState>;
    if (
      parsed.v !== 1 ||
      !Array.isArray(parsed.board) || parsed.board.length !== 16 ||
      !Array.isArray(parsed.claims) || parsed.claims.length !== 16 ||
      !["O", "X"].includes(parsed.turn ?? "") ||
      typeof parsed.currentChar !== "string" ||
      !Array.isArray(parsed.objections) || parsed.objections.length !== 2 ||
      !Array.isArray(parsed.winningLine) || !Array.isArray(parsed.retryBlocked)
    ) return null;

    const validPanels = parsed.board.every((panel) => (
      panel && typeof panel.id === "string" && typeof panel.icon === "string" &&
      typeof panel.name === "string" && typeof panel.category === "string" &&
      typeof panel.visualDescription === "string" && Array.isArray(panel.readings) &&
      panel.readings.every((item) => (
        typeof item === "string" || (
          item !== null && typeof item === "object" &&
          typeof item.display === "string" && typeof item.reading === "string"
        )
      ))
    ));
    const validClaims = parsed.claims.every((claim) => claim === "" || claim === "O" || claim === "X");
    if (!validPanels || !validClaims) return null;
    return parsed as ShareState;
  } catch {
    return null;
  }
}


