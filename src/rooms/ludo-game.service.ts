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

  /**
   * Initialize game state when game starts
   */
  initializeGame(players: Player[]): GameState {
    const tokens: Token[] = [];

    // Create 4 tokens for each player
    players.forEach((player) => {
      for (let i = 0; i < 4; i++) {
        tokens.push({
          id: `${player.color}-${i}`,
          color: player.color as PlayerColor,
          position: -1, // All tokens start in home
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
    };
  }

  /**
   * Roll dice for current player
   */
  rollDice(gameState: GameState): { diceValue: number; gameState: GameState } {
    if (!gameState.canRollDice) {
      throw new BadRequestException("Cannot roll dice at this time");
    }

    const diceValue = Math.floor(Math.random() * 6) + 1;

    const newGameState = {
      ...gameState,
      diceValue,
      canRollDice: false,
    };

    // Check if player has any valid moves
    const currentPlayerColor = this.getCurrentPlayerColor(
      newGameState.currentTurnPlayerIndex,
    );
    const hasValidMoves = this.hasValidMoves(
      newGameState,
      currentPlayerColor,
      diceValue,
    );

    if (!hasValidMoves) {
      // No valid moves, pass turn
      return this.passTurn(newGameState, diceValue);
    }

    return { diceValue, gameState: newGameState };
  }

  /**
   * Move a token
   */
  moveToken(
    gameState: GameState,
    tokenId: string,
    currentPlayerIndex: number,
  ): GameState {
    if (gameState.diceValue === null) {
      throw new BadRequestException("Dice must be rolled first");
    }

    const token = gameState.tokens.find((t) => t.id === tokenId);
    if (!token) {
      throw new BadRequestException("Token not found");
    }

    const currentPlayerColor = this.getCurrentPlayerColor(currentPlayerIndex);
    if (token.color !== currentPlayerColor) {
      throw new BadRequestException("Can only move your own tokens");
    }

    // Validate and execute move
    const newPosition = this.calculateNewPosition(token, gameState.diceValue);
    if (newPosition === null) {
      throw new BadRequestException("Invalid move");
    }

    const updatedTokens = [...gameState.tokens];
    const tokenIndex = updatedTokens.findIndex((t) => t.id === tokenId);
    const oldPosition = updatedTokens[tokenIndex].position;

    // Check for capture
    let capturedTokenId: string | undefined;
    if (
      newPosition >= 0 &&
      newPosition <= 51 &&
      !this.isSafeSquare(newPosition)
    ) {
      const capturedToken = updatedTokens.find(
        (t) =>
          t.position === newPosition &&
          t.color !== token.color &&
          !t.isInHomeStretch &&
          !t.isFinished,
      );
      if (capturedToken) {
        const capturedIndex = updatedTokens.findIndex(
          (t) => t.id === capturedToken.id,
        );
        updatedTokens[capturedIndex] = {
          ...capturedToken,
          position: -1,
          isInHome: true,
          isInHomeStretch: false,
        };
        capturedTokenId = capturedToken.id;
      }
    }

    // Update token position
    updatedTokens[tokenIndex] = {
      ...token,
      position: newPosition,
      isInHome: newPosition === -1,
      isInHomeStretch: newPosition >= 52 && newPosition < 58,
      isFinished: newPosition === 58,
    };

    // Record move
    const moveRecord: MoveRecord = {
      playerColor: token.color,
      tokenId: token.id,
      from: oldPosition,
      to: newPosition,
      timestamp: new Date(),
      capturedTokenId,
    };

    const moveHistory = [...gameState.moveHistory, moveRecord];

    // Check for winner
    const winner = this.checkWinner(updatedTokens);

    // Determine next turn
    const shouldContinueTurn =
      gameState.diceValue === 6 || capturedTokenId !== undefined;
    let nextGameState: GameState;

    if (shouldContinueTurn) {
      // Player gets another turn
      const consecutiveSixes =
        gameState.diceValue === 6 ? gameState.consecutiveSixes + 1 : 0;

      // If 3 consecutive sixes, pass turn
      if (consecutiveSixes >= 3) {
        nextGameState = this.passTurn(
          {
            ...gameState,
            tokens: updatedTokens,
            moveHistory,
            winner,
          },
          gameState.diceValue,
        ).gameState;
      } else {
        nextGameState = {
          ...gameState,
          tokens: updatedTokens,
          diceValue: null,
          canRollDice: true,
          consecutiveSixes,
          moveHistory,
          winner,
        };
      }
    } else {
      // Pass turn to next player
      nextGameState = this.passTurn(
        {
          ...gameState,
          tokens: updatedTokens,
          moveHistory,
          winner,
        },
        gameState.diceValue,
      ).gameState;
    }

    return nextGameState;
  }

  /**
   * Calculate new position for token after dice roll
   */
  private calculateNewPosition(token: Token, diceValue: number): number | null {
    // Token in home - can only move out with a 6
    if (token.isInHome) {
      if (diceValue === 6) {
        return this.getStartPosition(token.color);
      }
      return null;
    }

    // Token finished - cannot move
    if (token.isFinished) {
      return null;
    }

    // Token in home stretch
    if (token.isInHomeStretch) {
      const newPos = token.position + diceValue;
      if (newPos === 58) {
        return 58; // Finished
      } else if (newPos > 58) {
        return null; // Overshoot - invalid move
      }
      return newPos;
    }

    // Token on main board
    let newPos = token.position + diceValue;

    // Check if entering home stretch
    const homeStretchEntry = this.getHomeStretchEntry(token.color);

    // Calculate if we pass through home stretch entry
    const start = token.position;
    const end = newPos;

    // Handle board wrapping (0-51)
    if (end > 51) {
      newPos = end - 52;
    }

    // Check if we passed home stretch entry
    if (
      this.passedHomeStretchEntry(
        start,
        diceValue,
        homeStretchEntry,
        token.color,
      )
    ) {
      // Enter home stretch
      const stepsIntoHomeStretch = this.calculateHomeStretchSteps(
        start,
        diceValue,
        homeStretchEntry,
      );
      return 52 + stepsIntoHomeStretch - 1;
    }

    return newPos;
  }

  /**
   * Check if move passes through home stretch entry
   */
  private passedHomeStretchEntry(
    currentPos: number,
    diceValue: number,
    homeStretchEntry: number,
    color: PlayerColor,
  ): boolean {
    const endPos = currentPos + diceValue;

    // Check if we're at or passed the entry point
    if (currentPos <= homeStretchEntry && endPos >= homeStretchEntry) {
      return true;
    }

    // Handle wrapping around board
    if (currentPos <= homeStretchEntry && endPos > 51) {
      const wrapped = endPos - 52;
      return wrapped >= 0;
    }

    return false;
  }

  /**
   * Calculate steps into home stretch
   */
  private calculateHomeStretchSteps(
    currentPos: number,
    diceValue: number,
    homeStretchEntry: number,
  ): number {
    if (currentPos <= homeStretchEntry) {
      return diceValue - (homeStretchEntry - currentPos);
    }
    // Wrapped around
    return diceValue - (52 - currentPos + homeStretchEntry);
  }

  /**
   * Get starting position for each color
   */
  private getStartPosition(color: PlayerColor): number {
    const starts = {
      red: 1, // 2nd square from red home
      green: 14, // 2nd square from green home
      yellow: 27, // 2nd square from yellow home
      blue: 40, // 2nd square from blue home
    };
    return starts[color];
  }

  /**
   * Get home stretch entry position for each color
   */
  private getHomeStretchEntry(color: PlayerColor): number {
    const entries = {
      red: 51, // Entry to red home stretch
      green: 12, // Entry to green home stretch
      yellow: 25, // Entry to yellow home stretch
      blue: 38, // Entry to blue home stretch
    };
    return entries[color];
  }

  /**
   * Check if position is a safe square
   */
  private isSafeSquare(position: number): boolean {
    // Safe squares: start positions and star positions
    const safeSquares = [
      1,
      9,
      14,
      22,
      27,
      35,
      40,
      48, // Star squares (8 from each home)
    ];
    return safeSquares.includes(position);
  }

  /**
   * Check if player has valid moves
   */
  private hasValidMoves(
    gameState: GameState,
    playerColor: PlayerColor,
    diceValue: number,
  ): boolean {
    const playerTokens = gameState.tokens.filter(
      (t) => t.color === playerColor,
    );

    for (const token of playerTokens) {
      const newPos = this.calculateNewPosition(token, diceValue);
      if (newPos !== null) {
        return true;
      }
    }

    return false;
  }

  /**
   * Pass turn to next player
   */
  private passTurn(
    gameState: GameState,
    lastDiceValue: number,
  ): { diceValue: number; gameState: GameState } {
    const nextPlayerIndex =
      (gameState.currentTurnPlayerIndex + 1) % this.getPlayerCount(gameState);

    return {
      diceValue: lastDiceValue,
      gameState: {
        ...gameState,
        currentTurnPlayerIndex: nextPlayerIndex,
        diceValue: null,
        canRollDice: true,
        consecutiveSixes: 0,
      },
    };
  }

  /**
   * Get current player color
   */
  private getCurrentPlayerColor(playerIndex: number): PlayerColor {
    const colors = [
      PlayerColor.RED,
      PlayerColor.GREEN,
      PlayerColor.YELLOW,
      PlayerColor.BLUE,
    ];
    return colors[playerIndex];
  }

  /**
   * Get player count from game state
   */
  private getPlayerCount(gameState: GameState): number {
    const uniqueColors = new Set(gameState.tokens.map((t) => t.color));
    return uniqueColors.size;
  }

  /**
   * Check if a player has won
   */
  private checkWinner(tokens: Token[]): PlayerColor | null {
    const colorGroups = tokens.reduce(
      (acc, token) => {
        if (!acc[token.color]) {
          acc[token.color] = [];
        }
        acc[token.color].push(token);
        return acc;
      },
      {} as Record<PlayerColor, Token[]>,
    );

    for (const [color, colorTokens] of Object.entries(colorGroups)) {
      if (colorTokens.every((t) => t.isFinished)) {
        return color as PlayerColor;
      }
    }

    return null;
  }

  /**
   * Get valid moves for current player
   */
  getValidMoves(gameState: GameState, playerColor: PlayerColor): string[] {
    if (!gameState.diceValue) {
      return [];
    }

    const validTokenIds: string[] = [];
    const playerTokens = gameState.tokens.filter(
      (t) => t.color === playerColor,
    );

    for (const token of playerTokens) {
      const newPos = this.calculateNewPosition(token, gameState.diceValue);
      if (newPos !== null) {
        validTokenIds.push(token.id);
      }
    }

    return validTokenIds;
  }
}
