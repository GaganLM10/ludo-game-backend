export default () => ({
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3001', 10),
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
  session: {
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    name: process.env.SESSION_NAME || 'gamehub.sid',
    maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    useRedis: process.env.USE_REDIS === 'true',
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },
  game: {
    maxRooms: parseInt(process.env.MAX_ROOMS || '1000', 10),
    roomExpiryMinutes: parseInt(process.env.ROOM_EXPIRY_MINUTES || '120', 10),
    maxPlayersPerRoom: parseInt(process.env.MAX_PLAYERS_PER_ROOM || '4', 10),
  },
});