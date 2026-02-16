import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger, UsePipes, ValidationPipe } from "@nestjs/common";
import { RoomsService } from "./rooms.service";
import { SendMessageDto } from "../chat/dto/chat.dto";
import { v4 as uuidv4 } from "uuid";

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  },
  namespace: "/game",
})
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RoomsGateway.name);
  private socketToSession: Map<string, string> = new Map();

  constructor(private readonly roomsService: RoomsService) {}

  /**
   * Handle client connection
   */
  async handleConnection(client: Socket) {
    try {
      const sessionId = client.handshake.auth.sessionId;

      if (!sessionId) {
        this.logger.warn(`Client ${client.id} rejected: No session ID`);
        client.disconnect();
        return;
      }

      this.socketToSession.set(client.id, sessionId);

      const room = this.roomsService.getRoomBySessionId(sessionId);
      const player = this.roomsService.getPlayerBySessionId(sessionId);

      if (room && player) {
        client.join(room.code);
        this.logger.log(`Player ${player.name} connected to room ${room.code}`);

        // Send current room state to THIS client only
        client.emit("roomState", { room, player });

        // Broadcast updated room to all clients including the newly connected one
        this.server.to(room.code).emit("roomUpdated", { room });

        // Notify others in room that this player connected
        client.to(room.code).emit("playerConnected", {
          playerId: player.id,
          playerName: player.name,
        });
      } else {
        this.logger.log(`Client ${client.id} connected (no room)`);
      }
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   */
  async handleDisconnect(client: Socket) {
    try {
      const sessionId = this.socketToSession.get(client.id);

      if (sessionId) {
        const room = this.roomsService.getRoomBySessionId(sessionId);
        const player = this.roomsService.getPlayerBySessionId(sessionId);

        if (room && player) {
          this.logger.log(
            `Player ${player.name} disconnected from room ${room.code}`,
          );

          client.to(room.code).emit("playerDisconnected", {
            playerId: player.id,
            playerName: player.name,
          });
        }

        this.socketToSession.delete(client.id);
      }
    } catch (error) {
      this.logger.error(`Disconnection error: ${error.message}`);
    }
  }

  /**
   * Send chat message
   */
  @SubscribeMessage("sendMessage")
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SendMessageDto,
  ) {
    try {
      const sessionId = this.socketToSession.get(client.id);
      if (!sessionId) {
        return { error: "No session found" };
      }

      const room = this.roomsService.getRoomBySessionId(sessionId);
      const player = this.roomsService.getPlayerBySessionId(sessionId);

      if (!room || !player) {
        return { error: "Not in a room" };
      }

      const chatMessage = {
        id: uuidv4(),
        playerId: player.id,
        playerName: player.name,
        playerColor: player.color,
        message: payload.message,
        timestamp: new Date(),
        type: "player" as const,
      };

      // Broadcast to entire room (including sender)
      this.server.to(room.code).emit("newMessage", chatMessage);

      return { success: true };
    } catch (error) {
      this.logger.error(`Message error: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Update player color (real-time)
   */
  @SubscribeMessage("updateColor")
  async handleColorUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { newColor: string },
  ) {
    try {
      const sessionId = this.socketToSession.get(client.id);
      if (!sessionId) {
        return { error: "No session found" };
      }

      const { room, player } = this.roomsService.updatePlayerColor(
        sessionId,
        payload.newColor as any,
      );

      // Broadcast to entire room
      this.server.to(room.code).emit("roomUpdated", { room });

      // System message
      this.sendSystemMessage(
        room.code,
        `${player.name} changed color to ${player.color}`,
      );

      return { success: true, room, player };
    } catch (error) {
      this.logger.error(`Color update error: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Toggle ready status (real-time)
   */
  @SubscribeMessage("toggleReady")
  async handleReadyToggle(@ConnectedSocket() client: Socket) {
    try {
      const sessionId = this.socketToSession.get(client.id);
      if (!sessionId) {
        return { error: "No session found" };
      }

      const { room, player } = this.roomsService.togglePlayerReady(sessionId);

      // Broadcast to entire room
      this.server.to(room.code).emit("roomUpdated", { room });

      // System message
      this.sendSystemMessage(
        room.code,
        `${player.name} is ${player.isReady ? "ready" : "not ready"}`,
      );

      return { success: true, room, player };
    } catch (error) {
      this.logger.error(`Ready toggle error: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Start game (real-time)
   */
  @SubscribeMessage("startGame")
  async handleStartGame(@ConnectedSocket() client: Socket) {
    try {
      const sessionId = this.socketToSession.get(client.id);
      if (!sessionId) {
        return { error: "No session found" };
      }

      const room = this.roomsService.startGame(sessionId);

      // Broadcast to entire room
      this.server.to(room.code).emit("gameStarted", { room });

      // System message
      this.sendSystemMessage(room.code, "Game started! Good luck!");

      return { success: true, room };
    } catch (error) {
      this.logger.error(`Start game error: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Roll dice (game action)
   */
  @SubscribeMessage("rollDice")
  async handleRollDice(@ConnectedSocket() client: Socket) {
    try {
      const sessionId = this.socketToSession.get(client.id);
      if (!sessionId) {
        return { error: "No session found" };
      }

      const room = this.roomsService.rollDice(sessionId);

      // Broadcast updated game state to entire room
      this.server.to(room.code).emit("gameStateUpdated", { 
        gameState: room.gameState,
      });

      return { success: true, gameState: room.gameState };
    } catch (error) {
      this.logger.error(`Roll dice error: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Move token (game action)
   */
  @SubscribeMessage("moveToken")
  async handleMoveToken(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { tokenId: string },
  ) {
    try {
      const sessionId = this.socketToSession.get(client.id);
      if (!sessionId) {
        return { error: "No session found" };
      }

      const room = this.roomsService.moveToken(sessionId, payload.tokenId);

      // Broadcast updated game state to entire room
      this.server.to(room.code).emit("gameStateUpdated", {
        gameState: room.gameState,
      });

      // Check for winner
      if (room.gameState && room.gameState.winner) {
        this.sendSystemMessage(
          room.code,
          `${room.gameState.winner.toUpperCase()} wins! 🎉`,
        );
      }

      return { success: true, gameState: room.gameState };
    } catch (error) {
      this.logger.error(`Move token error: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Get valid moves
   */
  @SubscribeMessage("getValidMoves")
  async handleGetValidMoves(@ConnectedSocket() client: Socket) {
    try {
      const sessionId = this.socketToSession.get(client.id);
      if (!sessionId) {
        return { error: "No session found" };
      }

      const validMoves = this.roomsService.getValidMoves(sessionId);

      return { success: true, validMoves };
    } catch (error) {
      this.logger.error(`Get valid moves error: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Player joined (called from controller)
   */
  notifyPlayerJoined(roomCode: string, player: any) {
    this.logger.log(
      `Broadcasting player joined: ${player.name} to room ${roomCode}`,
    );

    // Broadcast to ALL clients in room (including the one who just joined)
    this.server.to(roomCode).emit("playerJoined", { player });

    // Also send updated room state
    const room = this.roomsService.getRoom(roomCode);
    this.server.to(roomCode).emit("roomUpdated", { room });

    // System message
    this.sendSystemMessage(roomCode, `${player.name} joined the room`);
  }

  /**
   * Player left (called from controller)
   */
  notifyPlayerLeft(roomCode: string, playerName: string) {
    this.logger.log(
      `Broadcasting player left: ${playerName} from room ${roomCode}`,
    );

    try {
      const room = this.roomsService.getRoom(roomCode);
      this.server.to(roomCode).emit("roomUpdated", { room });
      this.sendSystemMessage(roomCode, `${playerName} left the room`);
    } catch (error) {
      // Room might be deleted
      this.logger.warn(`Room ${roomCode} no longer exists`);
    }
  }

  /**
   * Game started (called from controller)
   */
  notifyGameStarted(roomCode: string, room: any) {
    this.logger.log(`Broadcasting game started in room ${roomCode}`);
    this.server.to(roomCode).emit("gameStarted", { room });
    this.sendSystemMessage(roomCode, "Game started! Good luck!");
  }

  /**
   * Send system message to room
   */
  private sendSystemMessage(roomCode: string, message: string) {
    const systemMessage = {
      id: uuidv4(),
      playerId: "system",
      playerName: "System",
      playerColor: "blue",
      message,
      timestamp: new Date(),
      type: "system" as const,
    };

    this.server.to(roomCode).emit("newMessage", systemMessage);
  }

  /**
   * Broadcast room update to all clients in room
   */
  broadcastRoomUpdate(roomCode: string) {
    try {
      const room = this.roomsService.getRoom(roomCode);
      this.logger.log(`Broadcasting room update for ${roomCode}`);
      this.server.to(roomCode).emit("roomUpdated", { room });
    } catch (error) {
      this.logger.error(`Broadcast error: ${error.message}`);
    }
  }
}
