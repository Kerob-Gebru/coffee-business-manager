
import "reflect-metadata";
import dotenv from "dotenv";
import path from "path";

import { NestFactory } from "@nestjs/core";
import session from "express-session";
import { AppModule } from "./app.module";

// Load .env from the project root directory
dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // API global prefix
  app.setGlobalPrefix("api");

  // Allow requests from the frontend
  app.enableCors({
    origin: [
      "http://localhost:3300",
      "http://127.0.0.1:3300",
    ],
    credentials: true,
  });

  // Session configuration
  app.use(
    session({
      name: "coffee.sid",
      secret:
        process.env.SESSION_SECRET ??
        "development-only-change-this-secret-please",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.SESSION_COOKIE_SECURE === "true",
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );

  // Backend port
  const port = Number(process.env.API_PORT ?? 4000);

  await app.listen(port);

  console.log(
    `Coffee Manager API listening on http://localhost:${port}/api`,
  );
}

bootstrap();
