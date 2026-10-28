import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { globalErrorHandler } from "./app/middlewares/globalErrorHandler.js";
import { notFound } from "./app/middlewares/notFound.js";
import routes from "./app/routes/index.js";
import { env } from "./config/env.js";

const app = express();
app.disable("x-powered-by");
app.use(cookieParser());
app.use(
	cors({
		origin: [env.CLIENT_URL,"http://localhost:3000"],
		credentials: true,
	}),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


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
