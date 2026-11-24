
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

  // Trust reverse proxy (required for Secure cookies behind AI Studio HTTPS proxy)
  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  // API global prefix
  app.setGlobalPrefix("api");

  // Allow requests from the frontend
  const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3300",
    "http://127.0.0.1:3300",
    ...(process.env.WEB_ORIGIN ? [process.env.WEB_ORIGIN] : []),
  ];
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  function isHttpsRequest(req: any): boolean {
    if (req.secure) return true;
    const xfProto = String(req.headers["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (xfProto === "https") return true;
    const origin = String(req.headers.origin || "");
    const referer = String(req.headers.referer || "");
    if (origin.startsWith("https://") || referer.startsWith("https://")) return true;
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
      .split(":")[0]
      .trim();
    return /\.run\.app$|\.onrender\.com$/i.test(host);
  }

  // Preserve HTTPS scheme across Next.js internal rewrite proxy and add CHIPS Partitioned attribute for HTTPS iframes
  app.use((req: any, res: any, next: any) => {
    const https = isHttpsRequest(req);
    if (https) {
      req.headers["x-forwarded-proto"] = "https";
      const origSetHeader = res.setHeader.bind(res);
      res.setHeader = (name: string, value: any) => {
        if (typeof name === "string" && name.toLowerCase() === "set-cookie") {
          const list = Array.isArray(value) ? value : [value];
          const updated = list.map((item) => {
            if (typeof item !== "string" || !item.startsWith("coffee.sid=")) return item;
            let cookieStr = item.replace(/;\s*SameSite=Lax/gi, "; SameSite=None");
            if (!/;\s*SameSite=/i.test(cookieStr)) cookieStr += "; SameSite=None";
            if (!/;\s*Secure\b/i.test(cookieStr)) cookieStr += "; Secure";
            if (!/;\s*Partitioned\b/i.test(cookieStr)) cookieStr += "; Partitioned";
            return cookieStr;
          });
          return origSetHeader(name, Array.isArray(value) ? updated : updated[0]);
        }
        return origSetHeader(name, value);
      };
    }
    next();
  });

  // Session configuration
  app.use(
    session({
      name: "coffee.sid",
      proxy: true,
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

  // Support cross-site HTTPS iframe preview cookies while keeping localhost HTTP working
  app.use((req: any, _res: any, next: any) => {
    const isHttps = isHttpsRequest(req);
    if (isHttps && req.session?.cookie) {
      req.session.cookie.secure = true;
      req.session.cookie.sameSite = "none";
    }
    next();
  });

  // Backend port
  const port = Number(process.env.API_PORT ?? 4100);

  await app.listen(port, "127.0.0.1");

  console.log(
    `Coffee Manager API listening on http://127.0.0.1:${port}/api`,
  );
}

bootstrap();
