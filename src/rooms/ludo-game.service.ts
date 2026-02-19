import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import {
  GameState,
  Token,
  PlayerColor,
  MoveRecord,
  Player,
} from "./entities/player.entity";

@Injectable()
export class LudoGameService {
  private readonly logger = new Logger(LudoGameService.name);

  // ─── Board constants ───────────────────────────────────────────────────────
  //
  // Main ring: 52 squares, positions 0-51, clockwise.
  //
  // Start (home) squares — where a token lands when first unlocked by a 6:
  //   Red   = 0   [6,1]
  //   Green = 13  [1,8]
  //   Yellow= 27  [8,13]
  //   Blue  = 41  [13,6]
  //
  // Home-stretch entry — the LAST main-ring square BEFORE entering the colored lane.
  // A token at this position, on the NEXT roll, enters the home stretch.
  // (Gateway square itself is the final main-ring square, position N; 
  //  the first stretch square is position 52 for every color.)
  //   Red    gateway = 51  [8,1]   → stretch goes up col-7 rows 5→1
  //   Green  gateway = 25  [7,14]  → stretch goes left row-7 cols 13→9
  //   Yellow gateway = 39  [14,7]  → stretch goes up col-7 rows 13→9
  //   Blue   gateway = 46  [8,6]   → stretch goes left row-7 cols 5→1
  //
  // Home stretch: positions 52-56 (5 squares of colored lane) + 57 = finished.
  // Safe squares (cannot be captured): start squares + star squares (8 from each start).

  private readonly START_POS: Record<PlayerColor, number> = {
    [PlayerColor.RED]:    0,
    [PlayerColor.GREEN]:  13,
    [PlayerColor.YELLOW]: 27,
    [PlayerColor.BLUE]:   41,
  };

  private readonly GATEWAY: Record<PlayerColor, number> = {
    [PlayerColor.RED]:    51,
    [PlayerColor.GREEN]:  25,
    [PlayerColor.YELLOW]: 39,
    [PlayerColor.BLUE]:   46,
  };

  private readonly SAFE_SQUARES = new Set([0, 8, 13, 21, 27, 35, 41, 49]);

  // ─── Public API ────────────────────────────────────────────────────────────

  initializeGame(players: Player[]): GameState {
    const tokens: Token[] = [];
    players.forEach((player) => {
      for (let i = 0; i < 4; i++) {
        tokens.push({
          id: `${player.color}-${i}`,
          color: player.color as PlayerColor,
          position: -1,
          isInHome: true,
          isInHomeStretch: false,
          isFinished: false,
        });
      }
    });
    return {
      currentTurnPlayerIndex: 0,
      diceValue: null,
      canRollDice: true,
      consecutiveSixes: 0,
      tokens,
      winner: null,
      moveHistory: [],
      playerColorOrder: players.map((p) => p.color as PlayerColor),
      validMoves: [],
    };
  }

  rollDice(gameState: GameState): { diceValue: number; gameState: GameState } {
    if (!gameState.canRollDice) {
      throw new BadRequestException("Cannot roll dice at this time");
    }

    // After 2 consecutive sixes, force 1-5 on the third roll
    let diceValue: number;
    if (gameState.consecutiveSixes >= 2) {
      diceValue = Math.floor(Math.random() * 5) + 1;
      this.logger.log(`Forced non-six (consecutiveSixes=${gameState.consecutiveSixes}): ${diceValue}`);
    } else {
      diceValue = Math.floor(Math.random() * 6) + 1;
    }

    const currentPlayerColor = this.getCurrentPlayerColor(gameState);
    const stateWithDice: GameState = {
      ...gameState,
      diceValue,
      canRollDice: false,
      validMoves: [],
    };

    const validMoves = this.computeValidMoves(stateWithDice, currentPlayerColor, diceValue);

    if (validMoves.length === 0) {
      this.logger.log(`No valid moves for ${currentPlayerColor} dice=${diceValue}, passing turn`);
      return this.passTurn(stateWithDice, diceValue);
    }

    return { diceValue, gameState: { ...stateWithDice, validMoves } };
  }

  moveToken(gameState: GameState, tokenId: string, _unused: number): GameState {
    if (gameState.diceValue === null) {
      throw new BadRequestException("Dice must be rolled first");
    }

    const token = gameState.tokens.find((t) => t.id === tokenId);
    if (!token) throw new BadRequestException("Token not found");

    const currentPlayerColor = this.getCurrentPlayerColor(gameState);
    if (token.color !== currentPlayerColor) {
      throw new BadRequestException("Can only move your own tokens");
    }
    if (!gameState.validMoves.includes(tokenId)) {
      throw new BadRequestException("This token is not a valid move");
    }

    const newPosition = this.calculateNewPosition(token, gameState.diceValue);
    if (newPosition === null) throw new BadRequestException("Invalid move");

    const updatedTokens = [...gameState.tokens];
    const tokenIndex = updatedTokens.findIndex((t) => t.id === tokenId);
    const oldPosition = updatedTokens[tokenIndex].position;

    // Check capture
    let capturedTokenId: string | undefined;
    if (newPosition >= 0 && newPosition <= 51 && !this.SAFE_SQUARES.has(newPosition)) {
      const capturedToken = updatedTokens.find(
        (t) => t.position === newPosition && t.color !== token.color
             && !t.isInHomeStretch && !t.isFinished && !t.isInHome,
      );
      if (capturedToken) {
        const ci = updatedTokens.findIndex((t) => t.id === capturedToken.id);
        updatedTokens[ci] = { ...capturedToken, position: -1, isInHome: true, isInHomeStretch: false };
        capturedTokenId = capturedToken.id;
      }
    }

    // Apply move
    updatedTokens[tokenIndex] = {
      ...token,
      position: newPosition,
      isInHome: false,
      isInHomeStretch: newPosition >= 52 && newPosition <= 56,
      isFinished: newPosition === 57,
    };

    const moveHistory = [
      ...gameState.moveHistory,
      { playerColor: token.color, tokenId: token.id, from: oldPosition, to: newPosition,
        timestamp: new Date(), capturedTokenId } as MoveRecord,
    ];

    const winner = this.checkWinner(updatedTokens);
    const rolledSix = gameState.diceValue === 6;
    const didCapture = !!capturedTokenId;
    const shouldContinueTurn = (rolledSix || didCapture) && !winner;

    if (shouldContinueTurn) {
      const newConsecutiveSixes = rolledSix ? gameState.consecutiveSixes + 1 : 0;
      if (newConsecutiveSixes >= 3) {
        return this.passTurn(
          { ...gameState, tokens: updatedTokens, moveHistory, winner, validMoves: [] },
          gameState.diceValue,
        ).gameState;
      }
      return {
        ...gameState,
        tokens: updatedTokens,
        diceValue: null,
        canRollDice: true,
        consecutiveSixes: newConsecutiveSixes,
        moveHistory,
        winner,
        validMoves: [],
      };
    }

    return this.passTurn(
      { ...gameState, tokens: updatedTokens, moveHistory, winner, validMoves: [] },
      gameState.diceValue,
    ).gameState;
  }

  getValidMoves(gameState: GameState, playerColor: PlayerColor): string[] {
    if (!gameState.diceValue) return [];
    return this.computeValidMoves(gameState, playerColor, gameState.diceValue);
  }

  // ─── Core movement logic ───────────────────────────────────────────────────

  private computeValidMoves(gameState: GameState, playerColor: PlayerColor, diceValue: number): string[] {
    return gameState.tokens
      .filter((t) => t.color === playerColor && !t.isFinished)
      .filter((t) => this.calculateNewPosition(t, diceValue) !== null)
      .map((t) => t.id);
  }

  /**
   * Returns the new position for a token given a dice roll, or null if invalid.
   *
   * Positions:
   *   -1         = home (not on board)
   *   0  – 51    = main ring (clockwise)
   *   52 – 56    = home stretch (colored lane, 5 squares)
   *   57         = finished
   */
  private calculateNewPosition(token: Token, diceValue: number): number | null {
    // From home: only a 6 unlocks the token, placing it on the start square
    if (token.isInHome) {
      return diceValue === 6 ? this.START_POS[token.color as PlayerColor] : null;
    }

    if (token.isFinished) return null;

    // In home stretch: move toward finish, exact count required
    if (token.isInHomeStretch) {
      const next = token.position + diceValue;
      if (next === 57) return 57;          // exact finish
      if (next > 57) return null;          // overshoot
      return next;
    }

    // On main ring
    const gateway = this.GATEWAY[token.color as PlayerColor];
    const stepsToGateway = this.stepsFromTo(token.position, gateway);

    if (diceValue <= stepsToGateway) {
      // Token does NOT reach or pass the gateway — stays on main ring
      const rawNew = token.position + diceValue;
      return rawNew > 51 ? rawNew - 52 : rawNew;
    } else {
      // Token reaches gateway and enters home stretch
      const stepsIntoStretch = diceValue - stepsToGateway - 1;
      // stepsToGateway steps lands on gateway; then 1 more step enters stretch pos 52,
      // further steps go to 53, 54, 55, 56
      const stretchPos = 52 + stepsIntoStretch;
      if (stretchPos > 56) return null;   // overshoot
      return stretchPos;
    }
  }

  /**
   * How many steps does it take to move FROM `from` TO `to` going clockwise?
   * Both positions are on the main ring (0-51).
   */
  private stepsFromTo(from: number, to: number): number {
    if (to >= from) return to - from;
    return 52 - from + to; // wrap around
  }

  private passTurn(gameState: GameState, lastDiceValue: number): { diceValue: number; gameState: GameState } {
    const playerCount = gameState.playerColorOrder?.length ?? this.getPlayerCount(gameState);
    const nextIndex = (gameState.currentTurnPlayerIndex + 1) % playerCount;
    return {
      diceValue: lastDiceValue,
      gameState: {
        ...gameState,
        currentTurnPlayerIndex: nextIndex,
        diceValue: null,
        canRollDice: true,
        consecutiveSixes: 0,
        validMoves: [],
      },
    };
  }

  private getCurrentPlayerColor(gameState: GameState): PlayerColor {
    if (gameState.playerColorOrder?.length > 0) {
      return gameState.playerColorOrder[gameState.currentTurnPlayerIndex];
    }
    return [PlayerColor.RED, PlayerColor.GREEN, PlayerColor.YELLOW, PlayerColor.BLUE][
      gameState.currentTurnPlayerIndex
    ];
  }

  private getPlayerCount(gameState: GameState): number {
    return new Set(gameState.tokens.map((t) => t.color)).size;
  }

  private checkWinner(tokens: Token[]): PlayerColor | null {
    const byColor: Record<string, Token[]> = {};
    tokens.forEach((t) => {
      if (!byColor[t.color]) byColor[t.color] = [];
      byColor[t.color].push(t);
    });
    for (const [color, ct] of Object.entries(byColor)) {
      if (ct.every((t) => t.isFinished)) return color as PlayerColor;
    }
    return null;
  }
}
