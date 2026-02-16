import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as session from "express-session";
import * as cookieParser from "cookie-parser";
import helmet from "helmet";
import * as compression from "compression";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log", "debug", "verbose"],
  });

  const configService = app.get(ConfigService);

  // Get configuration
  const port = configService.get<number>("app.port") || 3001;
  const frontendUrl = configService.get<string>("app.frontendUrl");
  const sessionSecret =
    configService.get<string>("session.secret") || "fallback-secret";
  const sessionName = configService.get<string>("session.name");
  const sessionMaxAge = configService.get<number>("session.maxAge");

  // Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allow Socket.io
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Compression
  app.use(compression());

  // Cookie Parser
  app.use(cookieParser());

  // Session Configuration
  app.use(
    session({
      secret: sessionSecret,
      name: sessionName,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // ← Key change!
        maxAge: sessionMaxAge,
        path: "/",
        domain: process.env.NODE_ENV === "production" ? undefined : "localhost", // ← Important!
      },
      // TODO: Add Redis store for production
      // store: new RedisStore({ client: redisClient }),
    }),
  );

  // CORS Configuration
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["set-cookie"],
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted values provided
      transform: true, // Transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global Prefix
  app.setGlobalPrefix("api");

  // Start Server
  await app.listen(port);

  logger.log(`🚀 Server running on http://localhost:${port}`);
  logger.log(`🎮 WebSocket running on ws://localhost:${port}/game`);
  logger.log(`🌐 Frontend URL: ${frontendUrl}`);
  logger.log(`📝 API Documentation: http://localhost:${port}/api`);
  logger.log(`🔒 Session secret: ${sessionSecret.substring(0, 10)}...`);
  logger.log(`🍪 Cookie name: ${sessionName}`);
}

bootstrap().catch((error) => {
  console.error("❌ Application failed to start:", error);
  process.exit(1);
});
