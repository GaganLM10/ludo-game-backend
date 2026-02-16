import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  Room,
  Player,
  PlayerColor,
  RoomStatus,
} from './entities/player.entity';
import { LudoGameService } from './ludo-game.service';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);
  private rooms: Map<string, Room> = new Map();
  private playerToRoom: Map<string, string> = new Map(); // playerId -> roomCode

  constructor(private readonly ludoGameService: LudoGameService) {}

  /**
   * Generate unique room code (ABCD-1234 format)
   */
  private generateRoomCode(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';

    let code = '';
    for (let i = 0; i < 4; i++) {
      code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    code += '-';
    for (let i = 0; i < 4; i++) {
      code += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }

    // Ensure uniqueness
    if (this.rooms.has(code)) {
      return this.generateRoomCode();
    }

    return code;
  }

  /**
   * Create a new room
   */
  createRoom(
    playerName: string,
    playerColor: PlayerColor,
    maxPlayers: number,
    sessionId: string,
  ): Room {
    // Check if player already in a room
    if (this.playerToRoom.has(sessionId)) {
      throw new ConflictException('You are already in a room');
    }

    const roomCode = this.generateRoomCode();
    const playerId = uuidv4();

    const admin: Player = {
      id: playerId,
      name: playerName,
      color: playerColor,
      isReady: false,
      isAdmin: true,
      joinedAt: new Date(),
      sessionId,
    };

    const room: Room = {
      id: uuidv4(),
      code: roomCode,
      adminId: playerId,
      players: [admin],
      maxPlayers,
      status: RoomStatus.WAITING,
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.rooms.set(roomCode, room);
    this.playerToRoom.set(sessionId, roomCode);

    this.logger.log(`Room ${roomCode} created by ${playerName}`);
    return room;
  }

  /**
   * Join an existing room
   */
  joinRoom(
    roomCode: string,
    playerName: string,
    sessionId: string,
  ): { room: Room; player: Player } {
    // Check if player already in a room
    if (this.playerToRoom.has(sessionId)) {
      throw new ConflictException('You are already in a room');
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException('Room is not accepting new players');
    }

    if (room.players.length >= room.maxPlayers) {
      throw new BadRequestException('Room is full');
    }

    // Find available color
    const takenColors = room.players.map((p) => p.color);
    const availableColors = Object.values(PlayerColor).filter(
      (color) => !takenColors.includes(color),
    );

    if (availableColors.length === 0) {
      throw new BadRequestException('No available colors');
    }

    const playerId = uuidv4();
    const newPlayer: Player = {
      id: playerId,
      name: playerName,
      color: availableColors[0],
      isReady: false,
      isAdmin: false,
      joinedAt: new Date(),
      sessionId,
    };

    room.players.push(newPlayer);
    room.lastActivity = new Date();
    this.playerToRoom.set(sessionId, roomCode);

    this.logger.log(`${playerName} joined room ${roomCode}`);
    return { room, player: newPlayer };
  }

  /**
   * Leave room
   */
  leaveRoom(sessionId: string): { room: Room | null; wasAdmin: boolean } {
    const roomCode = this.playerToRoom.get(sessionId);
    if (!roomCode) {
      throw new NotFoundException('You are not in any room');
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const playerIndex = room.players.findIndex(
      (p) => p.sessionId === sessionId,
    );
    if (playerIndex === -1) {
      throw new NotFoundException('Player not found in room');
    }

    const player = room.players[playerIndex];
    const wasAdmin = player.isAdmin;

    // Remove player
    room.players.splice(playerIndex, 1);
    this.playerToRoom.delete(sessionId);

    // If last player, delete room
    if (room.players.length === 0) {
      this.rooms.delete(roomCode);
      this.logger.log(`Room ${roomCode} deleted (empty)`);
      return { room: null, wasAdmin };
    }

    // If admin left, assign new admin
    if (wasAdmin && room.players.length > 0) {
      room.players[0].isAdmin = true;
      room.adminId = room.players[0].id;
      this.logger.log(
        `${room.players[0].name} is now admin of room ${roomCode}`,
      );
    }

    room.lastActivity = new Date();
    this.logger.log(`${player.name} left room ${roomCode}`);

    return { room, wasAdmin };
  }

  /**
   * Update player color
   */
  updatePlayerColor(
    sessionId: string,
    newColor: PlayerColor,
  ): { room: Room; player: Player } {
    const roomCode = this.playerToRoom.get(sessionId);
    if (!roomCode) {
      throw new NotFoundException('You are not in any room');
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const player = room.players.find((p) => p.sessionId === sessionId);
    if (!player) {
      throw new NotFoundException('Player not found in room');
    }

    // Check if color is available
    const takenColors = room.players
      .filter((p) => p.id !== player.id)
      .map((p) => p.color);

    if (takenColors.includes(newColor)) {
      throw new ConflictException('Color already taken');
    }

    player.color = newColor;
    room.lastActivity = new Date();

    this.logger.log(`${player.name} changed color to ${newColor}`);
    return { room, player };
  }

  /**
   * Toggle player ready status
   */
  togglePlayerReady(sessionId: string): { room: Room; player: Player } {
    const roomCode = this.playerToRoom.get(sessionId);
    if (!roomCode) {
      throw new NotFoundException('You are not in any room');
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const player = room.players.find((p) => p.sessionId === sessionId);
    if (!player) {
      throw new NotFoundException('Player not found in room');
    }

    player.isReady = !player.isReady;
    room.lastActivity = new Date();

    this.logger.log(
      `${player.name} is ${player.isReady ? 'ready' : 'not ready'}`,
    );
    return { room, player };
  }

  /**
   * Start game (admin only)
   */
  startGame(sessionId: string): Room {
    const roomCode = this.playerToRoom.get(sessionId);
    if (!roomCode) {
      throw new NotFoundException('You are not in any room');
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const player = room.players.find((p) => p.sessionId === sessionId);
    if (!player) {
      throw new NotFoundException('Player not found in room');
    }

    if (!player.isAdmin) {
      throw new BadRequestException('Only admin can start the game');
    }

    if (room.players.length < 2) {
      throw new BadRequestException('At least 2 players required to start');
    }

    // Check if all non-admin players are ready
    const allReady = room.players.every((p) => p.isReady || p.isAdmin);
    if (!allReady) {
      throw new BadRequestException('All players must be ready');
    }

    room.status = RoomStatus.PLAYING;
    room.lastActivity = new Date();

    // Initialize game state
    room.gameState = this.ludoGameService.initializeGame(room.players);

    this.logger.log(`Game started in room ${roomCode}`);
    return room;
  }

  /**
   * Get room by code
   */
  getRoom(roomCode: string): Room {
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }

  /**
   * Get room by session ID
   */
  getRoomBySessionId(sessionId: string): Room | null {
    const roomCode = this.playerToRoom.get(sessionId);
    if (!roomCode) {
      return null;
    }
    return this.rooms.get(roomCode) || null;
  }

  /**
   * Get player by session ID
   */
  getPlayerBySessionId(sessionId: string): Player | null {
    const room = this.getRoomBySessionId(sessionId);
    if (!room) {
      return null;
    }
    return room.players.find((p) => p.sessionId === sessionId) || null;
  }

  /**
   * Get all rooms (for admin/debugging)
   */
  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Cleanup expired rooms
   */
  cleanupExpiredRooms(expiryMinutes: number): void {
    const now = new Date();
    const expiredRooms: string[] = [];

    this.rooms.forEach((room, code) => {
      const minutesInactive =
        (now.getTime() - room.lastActivity.getTime()) / 1000 / 60;

      if (minutesInactive > expiryMinutes) {
        expiredRooms.push(code);
        // Remove all players from tracking
        room.players.forEach((player) => {
          this.playerToRoom.delete(player.sessionId);
        });
      }
    });

    expiredRooms.forEach((code) => {
      this.rooms.delete(code);
      this.logger.log(`Room ${code} deleted (expired)`);
    });

    if (expiredRooms.length > 0) {
      this.logger.log(`Cleaned up ${expiredRooms.length} expired rooms`);
    }
  }

  /**
   * Roll dice for current player
   */
  rollDice(sessionId: string): Room {
    const roomCode = this.playerToRoom.get(sessionId);
    if (!roomCode) {
      throw new NotFoundException('You are not in any room');
    }

    const room = this.rooms.get(roomCode);
    if (!room || !room.gameState) {
      throw new NotFoundException('Game not found');
    }

    const player = room.players.find((p) => p.sessionId === sessionId);
    if (!player) {
      throw new NotFoundException('Player not found in room');
    }

    // Check if it's player's turn
    const currentPlayer = room.players[room.gameState.currentTurnPlayerIndex];
    if (currentPlayer.id !== player.id) {
      throw new BadRequestException('Not your turn');
    }

    // Roll dice
    const { diceValue, gameState } = this.ludoGameService.rollDice(room.gameState);
    room.gameState = gameState;
    room.lastActivity = new Date();

    this.logger.log(`${player.name} rolled ${diceValue} in room ${roomCode}`);
    return room;
  }

  /**
   * Move token
   */
  moveToken(sessionId: string, tokenId: string): Room {
    const roomCode = this.playerToRoom.get(sessionId);
    if (!roomCode) {
      throw new NotFoundException('You are not in any room');
    }

    const room = this.rooms.get(roomCode);
    if (!room || !room.gameState) {
      throw new NotFoundException('Game not found');
    }

    const player = room.players.find((p) => p.sessionId === sessionId);
    if (!player) {
      throw new NotFoundException('Player not found in room');
    }

    // Check if it's player's turn
    const currentPlayer = room.players[room.gameState.currentTurnPlayerIndex];
    if (currentPlayer.id !== player.id) {
      throw new BadRequestException('Not your turn');
    }

    // Move token
    room.gameState = this.ludoGameService.moveToken(
      room.gameState,
      tokenId,
      room.gameState.currentTurnPlayerIndex,
    );
    room.lastActivity = new Date();

    this.logger.log(`${player.name} moved token ${tokenId} in room ${roomCode}`);
    return room;
  }

  /**
   * Get valid moves for current player
   */
  getValidMoves(sessionId: string): string[] {
    const roomCode = this.playerToRoom.get(sessionId);
    if (!roomCode) {
      throw new NotFoundException('You are not in any room');
    }

    const room = this.rooms.get(roomCode);
    if (!room || !room.gameState) {
      throw new NotFoundException('Game not found');
    }

    const player = room.players.find((p) => p.sessionId === sessionId);
    if (!player) {
      throw new NotFoundException('Player not found in room');
    }

    return this.ludoGameService.getValidMoves(
      room.gameState,
      player.color as PlayerColor,
    );
  }
}
