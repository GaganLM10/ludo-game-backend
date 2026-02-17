import {
  Controller,
  Post,
  Body,
  UseGuards,
  Session,
  Get,
  Patch,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { RoomsService } from "./rooms.service";
import { RoomsGateway } from "./rooms.gateway";
import {
  CreateRoomDto,
  JoinRoomDto,
  UpdatePlayerColorDto,
} from "./dto/room.dto";
import {
  RoomSessionGuard,
  AdminGuard,
} from "../common/guards/session.guard";
import { Session as ExpressSession } from "express-session";

@Controller("rooms")
export class RoomsController {
  private readonly logger = new Logger(RoomsController.name);

  constructor(
    private readonly roomsService: RoomsService,
    private readonly roomsGateway: RoomsGateway
  ) {}

  /**
   * Create a new room
   */
  @Post("create")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  createRoom(
    @Body() createRoomDto: CreateRoomDto,
    @Session()
    session: ExpressSession & {
      playerId?: string;
      roomCode?: string;
      isAdmin?: boolean;
    }
  ) {
    const room = this.roomsService.createRoom(
      createRoomDto.playerName,
      createRoomDto.playerColor,
      createRoomDto.maxPlayers,
      session.id
    );

    // Store in session
    session.playerId = room.players[0].id;
    session.roomCode = room.code;
    session.isAdmin = true;

    this.logger.log(`Player ${session.playerId} created room ${room.code}`);

    return {
      success: true,
      message: "Room created successfully",
      data: {
        room,
        player: room.players[0],
        // Return session ID so client can use it for WebSocket auth
        sessionId: session.id,
      },
    };
  }

  /**
   * Join an existing room
   */
  @Post("join")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  joinRoom(
    @Body() joinRoomDto: JoinRoomDto,
    @Session()
    session: ExpressSession & {
      playerId?: string;
      roomCode?: string;
      isAdmin?: boolean;
    }
  ) {
    const { room, player } = this.roomsService.joinRoom(
      joinRoomDto.roomCode,
      joinRoomDto.playerName,
      session.id
    );

    // Store in session
    session.playerId = player.id;
    session.roomCode = room.code;
    session.isAdmin = false;

    this.logger.log(`Player ${session.playerId} joined room ${room.code}`);

    // Broadcast to existing players in room via WebSocket
    // Note: We do NOT emit a system message here — the gateway's joinRoom WS event
    // will send the system message when the new player's socket connects
    this.roomsGateway.notifyPlayerJoined(room.code, player);

    return {
      success: true,
      message: "Joined room successfully",
      data: {
        room,
        player,
        // Return session ID so client can use it for WebSocket auth
        sessionId: session.id,
      },
    };
  }

  /**
   * Get current room (used on page load to restore state)
   */
  @Get("current")
  getCurrentRoom(
    @Session() session: ExpressSession & { roomCode?: string; playerId?: string; isAdmin?: boolean }
  ) {
    // No session or room in session
    if (!session?.playerId || !session?.roomCode) {
      return {
        success: false,
        data: null,
        message: "No active room session",
      };
    }

    try {
      const room = this.roomsService.getRoom(session.roomCode);
      const player = this.roomsService.getPlayerBySessionId(session.id);

      return {
        success: true,
        data: {
          room,
          player,
          sessionId: session.id,
        },
      };
    } catch (error) {
      this.logger.warn(
        `Failed to get room for session ${session.id}: ${error.message}`
      );
      // Clear stale session data
      delete session.playerId;
      delete session.roomCode;
      delete session.isAdmin;

      return {
        success: false,
        data: null,
        message: "Room not found or session expired",
      };
    }
  }

  /**
   * Get session ID (used by frontend for WebSocket auth)
   * This is safe because:
   * - We use httpOnly cookies so JS can't read the cookie
   * - But we need to pass session ID to WebSocket auth
   * - The server returns the session ID from req.session.id (which is safe)
   */
  @Get("session-id")
  getSessionId(
    @Session()
    session: ExpressSession & { playerId?: string; roomCode?: string }
  ) {
    return {
      success: true,
      data: {
        sessionId: session.id,
        hasSession: !!session.playerId,
        playerId: session.playerId || null,
        roomCode: session.roomCode || null,
      },
    };
  }

  /**
   * Check session status
   */
  @Get("session")
  checkSession(
    @Session()
    session: ExpressSession & { playerId?: string; roomCode?: string }
  ) {
    return {
      success: true,
      data: {
        hasSession: !!session.playerId,
        playerId: session.playerId || null,
        roomCode: session.roomCode || null,
        sessionId: session.id,
      },
    };
  }

  /**
   * Leave room
   */
  @Post("leave")
  @UseGuards(RoomSessionGuard)
  @HttpCode(HttpStatus.OK)
  leaveRoom(
    @Session()
    session: ExpressSession & {
      playerId?: string;
      roomCode?: string;
      isAdmin?: boolean;
    }
  ) {
    const roomCode = session.roomCode;
    const player = this.roomsService.getPlayerBySessionId(session.id);
    const playerName = player?.name || "Player";

    const { room } = this.roomsService.leaveRoom(session.id);

    // Clear session
    delete session.playerId;
    delete session.roomCode;
    delete session.isAdmin;

    this.logger.log(`Player ${playerName} left room ${roomCode}`);

    // Notify other players if room still exists
    if (roomCode) {
      this.roomsGateway.notifyPlayerLeft(roomCode, playerName);
    }

    return {
      success: true,
      message: "Left room successfully",
      data: { room },
    };
  }

  /**
   * Update player color
   */
  @Patch("color")
  @UseGuards(RoomSessionGuard)
  updateColor(
    @Body() updateColorDto: UpdatePlayerColorDto,
    @Session() session: ExpressSession & { roomCode?: string }
  ) {
    const { room, player } = this.roomsService.updatePlayerColor(
      session.id,
      updateColorDto.newColor
    );

    this.logger.log(`Player ${player.name} changed color to ${player.color}`);

    // Broadcast update via WebSocket
    if (session.roomCode) {
      this.roomsGateway.broadcastRoomUpdate(session.roomCode);
    }

    return {
      success: true,
      message: "Color updated successfully",
      data: { room, player },
    };
  }

  /**
   * Toggle ready status
   */
  @Post("ready")
  @UseGuards(RoomSessionGuard)
  @HttpCode(HttpStatus.OK)
  toggleReady(@Session() session: ExpressSession & { roomCode?: string }) {
    const { room, player } = this.roomsService.togglePlayerReady(session.id);

    this.logger.log(
      `Player ${player.name} is ${player.isReady ? "ready" : "not ready"}`
    );

    // Broadcast update via WebSocket
    if (session.roomCode) {
      this.roomsGateway.broadcastRoomUpdate(session.roomCode);
    }

    return {
      success: true,
      message: "Ready status updated",
      data: { room, player },
    };
  }

  /**
   * Start game (admin only)
   */
  @Post("start")
  @UseGuards(RoomSessionGuard, AdminGuard)
  @HttpCode(HttpStatus.OK)
  startGame(@Session() session: ExpressSession & { roomCode?: string }) {
    const room = this.roomsService.startGame(session.id);

    this.logger.log(`Game started in room ${room.code}`);

    // Broadcast game start via WebSocket
    if (session.roomCode) {
      this.roomsGateway.notifyGameStarted(session.roomCode, room);
    }

    return {
      success: true,
      message: "Game started successfully",
      data: { room },
    };
  }

  /**
   * Get all rooms (debug)
   */
  @Get("all")
  getAllRooms() {
    const rooms = this.roomsService.getAllRooms();
    return {
      success: true,
      data: { count: rooms.length, rooms },
    };
  }
}
