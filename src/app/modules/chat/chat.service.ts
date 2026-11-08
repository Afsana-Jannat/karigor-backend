import { randomUUID } from "node:crypto";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import {
	ChatPromptTemplate,
	MessagesPlaceholder,
} from "@langchain/core/prompts";
import { AREAS, SKILLS } from "../../../constants/index.js";
import { UserStatus, VerifyStatus } from "../../../generated/prisma/enums.js";
import { chatModel } from "../../../lib/llm.js";
import { prisma } from "../../../lib/prisma.js";
import { redis } from "../../../lib/redis.js";
import { vectorStore } from "../../../lib/vectorStore.js";
import { AppError } from "../../errors/AppError.js";
import type {
	IChatResponse,
	ISendChatMessagePayload,
} from "./chat.interface.js";
import { CHAT_SYSTEM_PROMPT, CONDENSE_QUESTION_PROMPT } from "./chat.prompt.js";

const TOP_K_TECHNICIANS = 4;
const MAX_HISTORY_MESSAGES = 10;
const HISTORY_TTL_SECONDS = 60 * 60;

type StoredMessage = { role: "human" | "ai"; content: string };
const historyKey = (userId: string, sessionId: string) =>
	`chat:karigor:${userId}:${sessionId}`;

const getHistory = async (
	userId: string,
	sessionId: string,
): Promise<StoredMessage[]> => {
	const raw = await redis.get(historyKey(userId, sessionId));
	if (!raw) return [];

	const history: unknown = JSON.parse(raw);
	if (
		!Array.isArray(history) ||
		!history.every(
			(message): message is StoredMessage =>
				typeof message === "object" &&
				message !== null &&
				"role" in message &&
				(message.role === "human" || message.role === "ai") &&
				"content" in message &&
				typeof message.content === "string",
		)
	) {
		throw new Error("Stored chat history has an invalid format");
	}
	return history;
};

const saveHistory = async (
	userId: string,
	sessionId: string,
	history: StoredMessage[],
) => {
	await redis.set(
		historyKey(userId, sessionId),
		JSON.stringify(history.slice(-MAX_HISTORY_MESSAGES)),
		{ expiration: { type: "EX", value: HISTORY_TTL_SECONDS } },
	);
};

const toLangChainMessages = (history: StoredMessage[]) =>
	history.map((message) =>
		message.role === "human"
			? new HumanMessage(message.content)
			: new AIMessage(message.content),
	);

const condenseQuestionChain = ChatPromptTemplate.fromMessages([
	["system", CONDENSE_QUESTION_PROMPT],
	new MessagesPlaceholder("history"),
	["human", "{question}"],
])
	.pipe(chatModel)
	.pipe(new StringOutputParser());

const answerChain = ChatPromptTemplate.fromMessages([
	["system", CHAT_SYSTEM_PROMPT],
	new MessagesPlaceholder("history"),
	["human", "{question}"],
])
	.pipe(chatModel)
	.pipe(new StringOutputParser());

const retrieveTechnicianIds = async (searchQuery: string) => {
	const results = await vectorStore.similaritySearchWithScore(
		searchQuery,
		TOP_K_TECHNICIANS,
	);
	return [
		...new Set(
			results
				.map(([document]) => document.metadata.technicianId)
				.filter((id): id is string => typeof id === "string"),
		),
	];
};

const getTechnicians = async (technicianIds: string[]) => {
	if (!technicianIds.length) return [];

	const technicians = await prisma.technicianProfile.findMany({
		where: {
			userId: { in: technicianIds },
			verifyStatus: VerifyStatus.VERIFIED,
			user: { status: UserStatus.ACTIVE },
		},
		select: {
			userId: true,
			skills: true,
			areas: true,
			experienceYears: true,
			ratingAvg: true,
			ratingCount: true,
			isAvailableNow: true,
			rateMin: true,
			rateMax: true,
			user: { select: { name: true } },
		},
	});

	return technicianIds
		.map((id) => technicians.find((technician) => technician.userId === id))
		.filter((technician) => technician !== undefined);
};

type ChatTechnician = Awaited<ReturnType<typeof getTechnicians>>[number];

const getLabels = (slugs: string[], list: typeof SKILLS | typeof AREAS) =>
	slugs.map((slug) => {
		const item = list.find((entry) => entry.slug === slug);
		return item ? `${item.en} (${item.bn})` : slug;
	});

const buildContext = (technicians: ChatTechnician[]) => {
	if (!technicians.length)
		return "No matching verified technicians were found.";

	return technicians
		.map((technician, index) =>
			[
				`Technician ${index + 1}: ${technician.user.name}`,
				`- Skills: ${getLabels(technician.skills, SKILLS).join(", ")}`,
				`- Areas served: ${getLabels(technician.areas, AREAS).join(", ")}`,
				`- Experience: ${technician.experienceYears} years`,
				`- Rating: ${technician.ratingAvg}/5 (${technician.ratingCount} reviews)`,
				`- Available now: ${technician.isAvailableNow ? "yes" : "no"}`,
				`- Rate range: ${
					technician.rateMin === null && technician.rateMax === null
						? "not set"
						: `${technician.rateMin ?? "not set"}-${technician.rateMax ?? "not set"} BDT`
				}`,
			].join("\n"),
		)
		.join("\n\n");
};

export const sendChatMessage = async (
	payload: ISendChatMessagePayload,
	userId: string,
): Promise<IChatResponse> => {
	const sessionId = payload.sessionId ?? randomUUID();

	try {
		const history = await getHistory(userId, sessionId);
		const historyMessages = toLangChainMessages(history);
		const searchQuery = history.length
			? await condenseQuestionChain.invoke({
					history: historyMessages,
					question: payload.message,
				})
			: payload.message;
		const technicianIds = await retrieveTechnicianIds(searchQuery);
		const technicians = await getTechnicians(technicianIds);
		const answer = await answerChain.invoke({
			context: buildContext(technicians),
			history: historyMessages,
			question: payload.message,
		});

		await saveHistory(userId, sessionId, [
			...history,
			{ role: "human", content: payload.message },
			{ role: "ai", content: answer },
		]);

		return {
			sessionId,
			answer,
			technicians: technicians.map((technician) => ({
				id: technician.userId,
				name: technician.user.name,
				skills: technician.skills,
				areas: technician.areas,
				experienceYears: technician.experienceYears,
				ratingAvg: technician.ratingAvg,
				ratingCount: technician.ratingCount,
				isAvailableNow: technician.isAvailableNow,
				rateMin: technician.rateMin,
				rateMax: technician.rateMax,
			})),
		};
	} catch (error) {
		console.error(
			"[Chat] Failed to generate technician recommendations:",
			error,
		);
		throw new AppError(
			"SERVICE_UNAVAILABLE",
			"Technician recommendations are temporarily unavailable. Please try again later.",
		);
	}
};
