import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { adminRateLimiter, authRateLimiter } from "./middlewares/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.js";
import authRouter from "./routes/auth.js";
import adminConfigRouter from "./routes/adminConfig.js";
import adminBlogsRouter from "./routes/adminBlogs.js";
import adminUploadsRouter from "./routes/adminUploads.js";
import publicBlogsRouter from "./routes/publicBlogs.js";
import analyticsRouter from "./routes/analytics.js";
import adminAnalyticsRouter from "./routes/adminAnalytics.js";
import adminAuditRouter from "./routes/adminAudit.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  
// Public ping endpoint - accessible from any origin
  app.get("/ping", (_req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.json({ pong: true });
  });

  // CORS configuration
  const allowedOrigins = env.FRONTEND_ORIGIN.split(",").map(origin => origin.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Reject requests with no origin (direct browser visits, curl, Postman, etc)
        if (!origin) {
          return callback(new Error("CORS not allowed - origin required"));
        }
        
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("CORS not allowed"));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"]
    })
  );
  
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  app.disable("x-powered-by");

  

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "keval-portfolio-backend" });
  });

  app.use("/api/auth", authRateLimiter, authRouter);
  app.use("/api/blogs", publicBlogsRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/admin/config", adminRateLimiter, adminConfigRouter);
  app.use("/api/admin/blogs", adminRateLimiter, adminBlogsRouter);
  app.use("/api/admin/uploads", adminRateLimiter, adminUploadsRouter);
  app.use("/api/admin/analytics", adminRateLimiter, adminAnalyticsRouter);
  app.use("/api/admin/audit-logs", adminRateLimiter, adminAuditRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
