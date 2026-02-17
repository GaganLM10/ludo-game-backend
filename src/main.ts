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

  const port = configService.get<number>("app.port") || 3001;
  const frontendUrl = configService.get<string>("app.frontendUrl");
  const sessionSecret =
    configService.get<string>("session.secret") || "fallback-secret-change-me";
  const sessionName =
    configService.get<string>("session.name") || "gamehub.sid";
  const sessionMaxAge =
    configService.get<number>("session.maxAge") || 86400000;
  const isProduction = configService.get<string>("app.nodeEnv") === "production";

  logger.log(`🌍 Environment: ${isProduction ? "production" : "development"}`);

  // Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // Compression
  app.use(compression());

  // Cookie Parser (must come before session)
  app.use(cookieParser());

  // Session Configuration - environment-aware
  // In production (Render): secure=true, sameSite='none' for cross-origin Netlify<->Render
  // In development (localhost): secure=false, sameSite='lax' so cookies work over HTTP
  app.use(
    session({
      secret: sessionSecret,
      name: sessionName,
      resave: false,
      saveUninitialized: false,
      rolling: true, // Reset expiry on each request
      cookie: {
        httpOnly: true, // Always true for security — we use session.id on backend only
        secure: isProduction, // true only in production (requires HTTPS)
        sameSite: isProduction ? "none" : "lax", // 'none' for cross-origin, 'lax' for localhost
        maxAge: sessionMaxAge,
        path: "/",
      },
    })
  );

  // CORS Configuration
  // Allow multiple origins so we can handle both localhost and production frontends
  const allowedOrigins = frontendUrl
    ? frontendUrl.split(",").map((url) => url.trim())
    : ["http://localhost:5173"];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.some((allowed) => origin.startsWith(allowed.replace(/\/$/, "")))) {
        return callback(null, true);
      }
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["set-cookie"],
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  // Global Prefix
  app.setGlobalPrefix("api");

  // Start Server
  await app.listen(port, "0.0.0.0");

  logger.log(`🚀 Server running on http://localhost:${port}`);
  logger.log(`🎮 WebSocket running on ws://localhost:${port}/game`);
  logger.log(`🌐 Frontend URL(s): ${allowedOrigins.join(", ")}`);
  logger.log(`🔒 Session name: ${sessionName}`);
  logger.log(`🍪 Cookies secure: ${isProduction}`);
}

bootstrap().catch((error) => {
  console.error("❌ Application failed to start:", error);
  process.exit(1);
});
