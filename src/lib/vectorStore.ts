import { PGVectorStore } from "@langchain/pgvector";
import pg from "pg";
import { env } from "../config/env.js";
import { embeddings } from "./llm.js";

const vectorPool = new pg.Pool({
	connectionString: env.DATABASE_URL,
	idleTimeoutMillis: 10_000,
	keepAlive: true,
});

vectorPool.on("error", (error) => {
	console.error(
		"[Vector store] Idle database connection error:",
		error.message,
	);
});

export const vectorStore = new PGVectorStore(embeddings, {
	pool: vectorPool,
	tableName: "technician_embeddings",
	columns: {
		idColumnName: "id",
		vectorColumnName: "embedding",
		contentColumnName: "content",
		metadataColumnName: "metadata",
	},
	distanceStrategy: "cosine",
});
