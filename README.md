# 🎮 GameHub Backend - NestJS + WebSocket

Professional, secure, and scalable backend for the GameHub multiplayer gaming platform.

## 🏗️ Architecture

```
Backend Stack:
├── NestJS Framework
├── Socket.io (WebSocket)
├── Express Session + Cookies
├── Class Validator (DTOs)
├── TypeScript
└── In-Memory Storage (Redis-ready)
```

## ✨ Features Implemented

### 🔒 Security
- ✅ Helmet.js (Security headers)
- ✅ CORS with credentials
- ✅ Rate limiting (Throttler)
- ✅ Session-based authentication
- ✅ HTTP-only cookies
- ✅ Input validation (DTOs + Pipes)
- ✅ Guards (Session, Room, Admin)
- ✅ Global exception filter

### 🎯 Core Features
- ✅ Room creation & management
- ✅ Player join/leave
- ✅ Color selection with conflict prevention
- ✅ Ready status system
- ✅ Admin controls
- ✅ Real-time WebSocket updates
- ✅ Chat system
- ✅ Room expiry & cleanup

### 📡 Real-time Events (WebSocket)
- ✅ `roomUpdated` - Room state changes
- ✅ `playerJoined` - New player
- ✅ `playerLeft` - Player disconnected
- ✅ `newMessage` - Chat messages
- ✅ `gameStarted` - Game begins
- ✅ `playerConnected` - Socket connection
- ✅ `playerDisconnected` - Socket disconnection

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Create Environment File

```bash
cp .env.example .env
```

Edit `.env`:
```env
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173
SESSION_SECRET=your-super-secret-change-this
```

### 3. Start Development Server

```bash
npm run start:dev
```

Server will start on: `http://localhost:3001`
WebSocket on: `ws://localhost:3001/game`

---

## 📚 API Documentation

### Base URL
```
http://localhost:3001/api
```

### Authentication
All endpoints use **session-based authentication** via cookies.
No JWT tokens - sessions are stored server-side.

---

## 🎮 REST API Endpoints

### 1. Create Room
**POST** `/api/rooms/create`

**Body:**
```json
{
  "playerName": "Player1",
  "playerColor": "red",
  "maxPlayers": 4
}
```

**Response:**
```json
{
  "success": true,
  "message": "Room created successfully",
  "data": {
    "room": {
      "id": "uuid",
      "code": "ABCD-1234",
      "adminId": "player-id",
      "players": [...],
      "maxPlayers": 4,
      "status": "waiting"
    },
    "player": {
      "id": "player-id",
      "name": "Player1",
      "color": "red",
      "isReady": false,
      "isAdmin": true
    }
  }
}
```

**Session Created:**
- `playerId`: Player's unique ID
- `roomCode`: Room code
- `isAdmin`: true

---

### 2. Join Room
**POST** `/api/rooms/join`

**Body:**
```json
{
  "roomCode": "ABCD-1234",
  "playerName": "Player2"
}
```

**Response:** Same as Create Room

**Session Created:**
- `playerId`: Player's unique ID
- `roomCode`: Room code
- `isAdmin`: false

---

### 3. Get Current Room
**GET** `/api/rooms/current`

**Requires:** Active session with room

**Response:**
```json
{
  "success": true,
  "data": {
    "room": {...},
    "player": {...}
  }
}
```

---

### 4. Leave Room
**POST** `/api/rooms/leave`

**Requires:** Active session with room

**Response:**
```json
{
  "success": true,
  "message": "Left room successfully",
  "data": {
    "room": {...} // null if last player
  }
}
```

**Session Cleared:**
- `playerId` removed
- `roomCode` removed
- `isAdmin` removed

---

### 5. Update Color
**PATCH** `/api/rooms/color`

**Requires:** Active session with room

**Body:**
```json
{
  "newColor": "blue"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Color updated successfully",
  "data": {
    "room": {...},
    "player": {...}
  }
}
```

**Validation:**
- Color must be: `red`, `blue`, `green`, or `yellow`
- Color cannot be taken by another player

---

### 6. Toggle Ready
**POST** `/api/rooms/ready`

**Requires:** Active session with room

**Response:**
```json
{
  "success": true,
  "message": "Ready status updated",
  "data": {
    "room": {...},
    "player": {...}
  }
}
```

---

### 7. Start Game
**POST** `/api/rooms/start`

**Requires:** 
- Active session with room
- Must be admin
- All players must be ready
- Minimum 2 players

**Response:**
```json
{
  "success": true,
  "message": "Game started successfully",
  "data": {
    "room": {
      "status": "playing",
      ...
    }
  }
}
```

---

### 8. Get All Rooms (Debug)
**GET** `/api/rooms/all`

**Response:**
```json
{
  "success": true,
  "data": {
    "count": 5,
    "rooms": [...]
  }
}
```

---

## 🔌 WebSocket Events

### Connection
```typescript
import io from 'socket.io-client';

const socket = io('http://localhost:3001/game', {
  auth: {
    sessionId: 'your-session-id' // From cookie
  },
  withCredentials: true
});
```

### Events to Emit

#### 1. Send Message
```typescript
socket.emit('sendMessage', {
  message: 'Hello everyone!'
}, (response) => {
  console.log(response); // { success: true }
});
```

#### 2. Update Color
```typescript
socket.emit('updateColor', {
  newColor: 'blue'
}, (response) => {
  console.log(response); // { success: true, room, player }
});
```

#### 3. Toggle Ready
```typescript
socket.emit('toggleReady', {}, (response) => {
  console.log(response); // { success: true, room, player }
});
```

#### 4. Start Game
```typescript
socket.emit('startGame', {}, (response) => {
  console.log(response); // { success: true, room }
});
```

---

### Events to Listen

#### 1. Room State (Initial)
```typescript
socket.on('roomState', (data) => {
  console.log('Current room:', data.room);
  console.log('Current player:', data.player);
});
```

#### 2. Room Updated
```typescript
socket.on('roomUpdated', (data) => {
  console.log('Room updated:', data.room);
  // Update UI with new room state
});
```

#### 3. Player Joined
```typescript
socket.on('playerJoined', (data) => {
  console.log('New player:', data.player);
});
```

#### 4. Player Connected
```typescript
socket.on('playerConnected', (data) => {
  console.log('Player online:', data.playerName);
});
```

#### 5. Player Disconnected
```typescript
socket.on('playerDisconnected', (data) => {
  console.log('Player offline:', data.playerName);
});
```

#### 6. New Message
```typescript
socket.on('newMessage', (message) => {
  console.log('Chat:', message);
  // {
  //   id: 'uuid',
  //   playerId: 'player-id',
  //   playerName: 'Player1',
  //   playerColor: 'red',
  //   message: 'Hello!',
  //   timestamp: Date,
  //   type: 'player' | 'system'
  // }
});
```

#### 7. Game Started
```typescript
socket.on('gameStarted', (data) => {
  console.log('Game started!', data.room);
  // Navigate to game board
});
```

---

## 🔐 Security Features

### 1. Session-Based Authentication
- No JWTs - traditional server-side sessions
- Cookies are HTTP-only, Secure (in prod), SameSite=Lax
- Session data stored server-side
- 24-hour expiry (configurable)

### 2. Input Validation
Every endpoint validates input using DTOs:
```typescript
class CreateRoomDto {
  @IsString()
  @Length(1, 20)
  playerName: string;

  @IsEnum(PlayerColor)
  playerColor: PlayerColor;

  @Min(2) @Max(4)
  maxPlayers: number;
}
```

### 3. Guards
- `SessionGuard` - Requires active session
- `RoomSessionGuard` - Requires player in room
- `AdminGuard` - Requires admin status

### 4. Rate Limiting
- Default: 100 requests per minute
- Create room: 5 per minute
- Join room: 10 per minute

### 5. CORS
- Strict origin validation
- Credentials required
- Only frontend URL allowed

---

## 📊 Data Models

### Player
```typescript
{
  id: string;              // UUID
  name: string;            // 1-20 characters
  color: PlayerColor;      // red|blue|green|yellow
  isReady: boolean;
  isAdmin: boolean;
  joinedAt: Date;
  sessionId: string;       // For tracking
}
```

### Room
```typescript
{
  id: string;              // UUID
  code: string;            // ABCD-1234 format
  adminId: string;
  players: Player[];
  maxPlayers: number;      // 2-4
  status: RoomStatus;      // waiting|playing|finished
  createdAt: Date;
  lastActivity: Date;
}
```

---

## 🧪 Testing

### Manual Testing with cURL

**Create Room:**
```bash
curl -X POST http://localhost:3001/api/rooms/create \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "playerName": "Player1",
    "playerColor": "red",
    "maxPlayers": 4
  }'
```

**Join Room:**
```bash
curl -X POST http://localhost:3001/api/rooms/join \
  -H "Content-Type: application/json" \
  -c cookies2.txt \
  -d '{
    "roomCode": "ABCD-1234",
    "playerName": "Player2"
  }'
```

**Get Current Room:**
```bash
curl -X GET http://localhost:3001/api/rooms/current \
  -b cookies.txt
```

### Testing with Postman
1. Import collection (create from docs above)
2. Enable "Send cookies" in settings
3. Test create → join → update color → ready → start flow

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | development |
| `PORT` | Server port | 3001 |
| `FRONTEND_URL` | CORS origin | http://localhost:5173 |
| `SESSION_SECRET` | Session encryption key | (required) |
| `SESSION_NAME` | Cookie name | gamehub.sid |
| `SESSION_MAX_AGE` | Session duration (ms) | 86400000 (24h) |
| `USE_REDIS` | Enable Redis store | false |
| `MAX_ROOMS` | Max concurrent rooms | 1000 |
| `ROOM_EXPIRY_MINUTES` | Auto-cleanup time | 120 |

---

## 🚀 Production Deployment

### 1. Environment Setup
```bash
NODE_ENV=production
SESSION_SECRET=use-a-strong-random-secret-here
USE_REDIS=true
REDIS_HOST=your-redis-host
REDIS_PASSWORD=your-redis-password
```

### 2. Build
```bash
npm run build
```

### 3. Start
```bash
npm run start:prod
```

### 4. Add Redis (Recommended)
```typescript
// In main.ts
import * as RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisClient = createClient({
  host: configService.get('redis.host'),
  port: configService.get('redis.port'),
  password: configService.get('redis.password'),
});

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    // ... other options
  }),
);
```

---

## 📝 Next Steps

1. ✅ Connect frontend to backend
2. ✅ Test real-time features
3. ⏳ Implement game logic
4. ⏳ Add persistent storage (Redis)
5. ⏳ Add user authentication
6. ⏳ Add game history
7. ⏳ Add leaderboards

---

## 🐛 Troubleshooting

### Session not persisting
- Check `withCredentials: true` in frontend
- Verify CORS configuration
- Check cookie settings in browser

### WebSocket not connecting
- Verify session ID in auth handshake
- Check CORS for WebSocket
- Ensure port 3001 is accessible

### Room not found
- Check session has `roomCode`
- Verify room hasn't expired
- Check cleanup hasn't removed it

---

## 📞 Support

For issues or questions:
1. Check logs: `npm run start:dev`
2. Test with curl/Postman
3. Verify environment variables
4. Check session cookies

---

**Built with ❤️ using NestJS, Socket.io, and TypeScript**
