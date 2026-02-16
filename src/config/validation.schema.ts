import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // App
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3001),
  
  // CORS
  FRONTEND_URL: Joi.string().default('http://localhost:5173'),
  
  // Session
  SESSION_SECRET: Joi.string().required(),
  SESSION_NAME: Joi.string().default('gamehub.sid'),
  SESSION_MAX_AGE: Joi.number().default(86400000), // 24 hours
  
  // Redis (optional for development)
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  USE_REDIS: Joi.boolean().default(false),
  
  // Rate Limiting
  THROTTLE_TTL: Joi.number().default(60000), // 1 minute
  THROTTLE_LIMIT: Joi.number().default(100), // 100 requests
  
  // Game Settings
  MAX_ROOMS: Joi.number().default(1000),
  ROOM_EXPIRY_MINUTES: Joi.number().default(120), // 2 hours
  MAX_PLAYERS_PER_ROOM: Joi.number().default(4),
});
