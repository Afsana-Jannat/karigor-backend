import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { globalErrorHandler } from "./app/middlewares/globalErrorHandler.js";
import { notFound } from "./app/middlewares/notFound.js";
import routes from "./app/routes/index.js";
import { env } from "./config/env.js";

const app = express();


app.set("trust proxy", 1);

app.disable("x-powered-by");


app.use(helmet());


const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests from this IP, please try again after a minute.",
    },
  },
});
app.use("/api/", globalLimiter);

const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many authentication attempts, please try again later.",
    },
  },
});

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Apply strict limiter specifically to sensitive auth endpoints
app.use("/api/v1/auth/register", authLimiter);
app.use("/api/v1/auth/login", authLimiter);
app.use("/api/v1/auth/verify-otp", authLimiter);

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Karigor Backend is running!",
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
  });
});

// All API routes live under /api/v1
app.use("/api/v1", routes);

// These two must stay last
app.use(notFound);
app.use(globalErrorHandler);

export default app;