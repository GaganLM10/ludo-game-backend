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

// Build allowed origins from environment
function getAllowedOrigins(): string | string[] {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const origins = frontendUrl.split(",").map((url) => url.trim());
  return origins.length === 1 ? origins[0] : origins;
}

@WebSocketGateway({
  cors: {
    origin: getAllowedOrigins(),
    credentials: true,
  },
  namespace: "/game",
  // Allow both websocket and polling transports for better compatibility
  transports: ["websocket", "polling"],
})
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RoomsGateway.name);

  // Map from socketId -> sessionId (extracted from handshake)
  private socketToSession: Map<string, string> = new Map();

  constructor(private readonly roomsService: RoomsService) {}

  /**
   * Extract session ID from the socket handshake.
   * The client sends session ID via auth.sessionId.
   * We verify this session ID actually exists in our service.
   * NOTE: We do NOT read cookies here — session ID is passed explicitly by client
   * after receiving it from the HTTP join/create response.
   */
  private extractSessionId(client: Socket): string | null {
    // Primary: from auth object (set by client after HTTP API call)
    const authSessionId = client.handshake.auth?.sessionId;
    if (authSessionId && typeof authSessionId === "string") {
      return authSessionId;
    }
    return null;
  }

  /**
   * Handle client connection
   */
  async handleConnection(client: Socket) {
    try {
      const sessionId = this.extractSessionId(client);

      if (!sessionId) {
        this.logger.warn(
          `Client ${client.id} rejected: No session ID in auth`
        );
        client.emit("error", { message: "Authentication required" });
        client.disconnect();
        return;
      }

      this.socketToSession.set(client.id, sessionId);

      // Check if this session already has a room
      const room = this.roomsService.getRoomBySessionId(sessionId);
      const player = this.roomsService.getPlayerBySessionId(sessionId);

      if (room && player) {
        // Join the socket.io room
        await client.join(room.code);

        this.logger.log(
          `Player ${player.name} (${client.id}) connected to room ${room.code}`
        );

        // Send current room state to THIS client only
        client.emit("roomState", { room, player });

        // Broadcast updated room to all clients in room (including the newly connected one)
        this.server.to(room.code).emit("roomUpdated", { room });
      } else {
        this.logger.log(
          `Client ${client.id} connected (session exists but no room)`
        );
        // Still acknowledge the connection — client may be connecting before joining
        client.emit("connected", { message: "Connected successfully" });
      }
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.emit("error", { message: "Connection error" });
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
            `Player ${player.name} disconnected from room ${room.code}`
          );

          // Notify others in the room
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
   * Client calls this after joining a room via HTTP to subscribe to room events.
   * This allows the client to join the socket.io room channel.
   */
  @SubscribeMessage("joinRoom")
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomCode: string }
  ) {
    try {
      const sessionId = this.socketToSession.get(client.id);
      if (!sessionId) {
        return { error: "No session found" };
      }

      const room = this.roomsService.getRoomBySessionId(sessionId);
      const player = this.roomsService.getPlayerBySessionId(sessionId);

      if (!room || !player) {
        return { error: "You are not in a room" };
      }

      // Verify the room code matches
      if (room.code !== payload.roomCode) {
        return { error: "Room code mismatch" };
      }

      // Join the socket.io room channel
      await client.join(room.code);

      this.logger.log(
        `Player ${player.name} joined WS room channel ${room.code}`
      );

      // Send current state to this client
      client.emit("roomState", { room, player });

      // Notify all clients in room of updated state
      this.server.to(room.code).emit("roomUpdated", { room });

      // Send system message that player joined (only if not already announced)
      this.sendSystemMessage(room.code, `${player.name} joined the room`);

      return { success: true };
    } catch (error) {
      this.logger.error(`joinRoom error: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Send chat message
   */
  @SubscribeMessage("sendMessage")
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SendMessageDto
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
    @MessageBody() payload: { newColor: string }
  ) {
    try {
      const sessionId = this.socketToSession.get(client.id);
      if (!sessionId) {
        return { error: "No session found" };
      }

      const { room, player } = this.roomsService.updatePlayerColor(
        sessionId,
        payload.newColor as any
      );

      // Broadcast to entire room
      this.server.to(room.code).emit("roomUpdated", { room });

      // System message
      this.sendSystemMessage(
        room.code,
        `${player.name} changed color to ${player.color}`
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
        `${player.name} is ${player.isReady ? "ready ✅" : "not ready ❌"}`
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

      // Broadcast game start to ALL clients in room
      this.server.to(room.code).emit("gameStarted", { room });

      // System message
      this.sendSystemMessage(room.code, "🎲 Game started! Good luck!");

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
    @MessageBody() payload: { tokenId: string }
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
          `🏆 ${room.gameState.winner.toUpperCase()} wins!`
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

  // ─── Methods called from RoomsController ────────────────────────────────────

  /**
   * Called by controller after a player joins via HTTP.
   * We need to broadcast to existing players only (the new player will call
   * joinRoom WS event themselves once their socket connects).
   */
  notifyPlayerJoined(roomCode: string, player: any) {
    this.logger.log(
      `Broadcasting player joined: ${player.name} to room ${roomCode}`
    );

    try {
      const room = this.roomsService.getRoom(roomCode);

      // Broadcast updated room to all EXISTING sockets in the room
      // The new player will get state when they emit 'joinRoom' from their socket
      this.server.to(roomCode).emit("roomUpdated", { room });
    } catch (error) {
      this.logger.error(`notifyPlayerJoined error: ${error.message}`);
    }
  }

  /**
   * Called by controller after a player leaves via HTTP.
   */
  notifyPlayerLeft(roomCode: string, playerName: string) {
    this.logger.log(
      `Broadcasting player left: ${playerName} from room ${roomCode}`
    );

    try {
      const room = this.roomsService.getRoom(roomCode);
      this.server.to(roomCode).emit("roomUpdated", { room });
      this.sendSystemMessage(roomCode, `${playerName} left the room`);
    } catch (error) {
      // Room might be deleted if last player left
      this.logger.warn(`Room ${roomCode} no longer exists`);
      this.server.to(roomCode).emit("roomDeleted", { roomCode });
    }
  }

  /**
   * Called by controller after game starts via HTTP.
   */
  notifyGameStarted(roomCode: string, room: any) {
    this.logger.log(`Broadcasting game started in room ${roomCode}`);
    this.server.to(roomCode).emit("gameStarted", { room });
    this.sendSystemMessage(roomCode, "🎲 Game started! Good luck!");
  }

  /**
   * Broadcast room update to all clients in room.
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

  // ─── Private helpers ────────────────────────────────────────────────────────

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
}
