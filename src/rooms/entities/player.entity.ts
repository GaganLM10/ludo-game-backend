export enum PlayerColor {
  RED = "red",
  BLUE = "blue",
  GREEN = "green",
  YELLOW = "yellow",
}

export class Player {
  id: string;
  name: string;
  color: PlayerColor;
  isReady: boolean;
  isAdmin: boolean;
  joinedAt: Date;
  sessionId: string; // For WebSocket connection tracking
}

export enum RoomStatus {
  WAITING = "waiting",
  PLAYING = "playing",
  FINISHED = "finished",
}

// Ludo game specific entities
export interface Token {
  id: string; // "red-0", "red-1", etc.
  color: PlayerColor;
  position: number; // -1 = home, 0-51 = board path, 52-57 = home stretch, 58 = finished
  isInHome: boolean;
  isInHomeStretch: boolean;
  isFinished: boolean;
}

export interface GameState {
  currentTurnPlayerIndex: number; // Index in players array
  diceValue: number | null;
  canRollDice: boolean;
  consecutiveSixes: number;
  tokens: Token[]; // All tokens for all players
  winner: PlayerColor | null;
  moveHistory: MoveRecord[];
  playerColorOrder: PlayerColor[];
  // Always up-to-date valid move token IDs for the current player after dice roll
  validMoves: string[];
}

export interface MoveRecord {
  playerColor: PlayerColor;
  tokenId: string;
  from: number;
  to: number;
  timestamp: Date;
  capturedTokenId?: string;
}

export class Room {
  id: string;
  code: string;
  adminId: string;
  players: Player[];
  maxPlayers: number;
  status: RoomStatus;
  createdAt: Date;
  lastActivity: Date;
  gameState?: GameState; // Only exists when status is PLAYING
}
