import { Embeddings, type EmbeddingsParams } from "@langchain/core/embeddings";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { RunnableLambda } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { env } from "../config/env.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const getOpenRouterConfig = () => {
	const {
		OPENROUTER_API_KEY,
		OPENROUTER_CHAT_MODEL,
		OPENROUTER_EMBEDDING_MODEL,
	} = env;
	if (
		!OPENROUTER_API_KEY ||
		!OPENROUTER_CHAT_MODEL ||
		!OPENROUTER_EMBEDDING_MODEL
	) {
		throw new Error(
			"OPENROUTER_API_KEY, OPENROUTER_CHAT_MODEL, and OPENROUTER_EMBEDDING_MODEL must be configured",
		);
	}
	return {
		apiKey: OPENROUTER_API_KEY,
		chatModel: OPENROUTER_CHAT_MODEL,
		embeddingModel: OPENROUTER_EMBEDDING_MODEL,
	};
};

let openRouterChatModel: ChatOpenAI | undefined;

const getChatModel = () => {
	if (openRouterChatModel) return openRouterChatModel;

	const { apiKey, chatModel } = getOpenRouterConfig();
	const fallbackModels = env.OPENROUTER_FALLBACK_CHAT_MODELS.split(",")
		.map((model) => model.trim())
		.filter(Boolean);

	openRouterChatModel = new ChatOpenAI({
		model: chatModel,
		apiKey,
		temperature: 0.2,
		modelKwargs: {
			models: [chatModel, ...fallbackModels],
		},
		configuration: {
			baseURL: OPENROUTER_BASE_URL,
			defaultHeaders: {
				"HTTP-Referer": env.CLIENT_URL,
				"X-Title": "Karigor",
			},
		},
	});
	return openRouterChatModel;
};

export const chatModel = RunnableLambda.from(
	(input: BaseLanguageModelInput, options) =>
		getChatModel().invoke(input, options),
).withRetry({ stopAfterAttempt: 3 });

type OpenRouterEmbeddingResponse = {
	data: { embedding: number[]; index: number }[];
};

class OpenRouterEmbeddings extends Embeddings {
	constructor(params: EmbeddingsParams = {}) {
		super(params);
	}

	private async embed(input: string[]): Promise<number[][]> {
		const { apiKey, embeddingModel } = getOpenRouterConfig();
		const response = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: embeddingModel,
				input,
				encoding_format: "float",
			}),
		});

		if (!response.ok) {
			throw new Error(
				`OpenRouter embeddings failed: ${response.status} ${await response.text()}`,
			);
		}

		const result = (await response.json()) as OpenRouterEmbeddingResponse;
		if (
			!Array.isArray(result.data) ||
			result.data.some((item) => !Array.isArray(item.embedding))
		) {
			throw new Error("OpenRouter returned an invalid embeddings response");
		}
		return result.data
			.sort((a, b) => a.index - b.index)
			.map((item) => item.embedding);
	}

	async embedDocuments(texts: string[]): Promise<number[][]> {
		return this.caller.call(() => this.embed(texts));
	}

	async embedQuery(text: string): Promise<number[]> {
		const [vector] = await this.caller.call(() => this.embed([text]));
		if (!vector) throw new Error("OpenRouter returned no query embedding");
		return vector;
	}
}

export const embeddings = new OpenRouterEmbeddings({ maxRetries: 3 });
