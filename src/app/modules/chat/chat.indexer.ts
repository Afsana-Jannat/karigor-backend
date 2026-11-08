import { createHash } from "node:crypto";
import { Document } from "@langchain/core/documents";
import { AREAS, SKILLS } from "../../../constants/index.js";
import { UserStatus, VerifyStatus } from "../../../generated/prisma/enums.js";
import { prisma } from "../../../lib/prisma.js";
import { vectorStore } from "../../../lib/vectorStore.js";

const INDEX_BATCH_SIZE = 20;

const indexableTechnicianSelect = {
	userId: true,
	bio: true,
	experienceYears: true,
	skills: true,
	areas: true,
	rateMin: true,
	rateMax: true,
	ratingAvg: true,
	ratingCount: true,
	completedJobs: true,
	user: {
		select: {
			name: true,
		},
	},
} as const;

type IndexableTechnician = {
	userId: string;
	bio: string | null;
	experienceYears: number;
	skills: string[];
	areas: string[];
	rateMin: number | null;
	rateMax: number | null;
	ratingAvg: number;
	ratingCount: number;
	completedJobs: number;
	user: { name: string };
};

const getLabels = (slugs: string[], list: typeof SKILLS | typeof AREAS) =>
	slugs.map((slug) => {
		const item = list.find((entry) => entry.slug === slug);
		return item ? `${item.en} (${item.bn}; ${item.aliases.join(", ")})` : slug;
	});

const embeddingIdFor = (technicianId: string) => {
	const hash = createHash("sha1")
		.update(`karigor-technician:${technicianId}`)
		.digest();
	hash[6] = (hash[6] & 0x0f) | 0x50;
	hash[8] = (hash[8] & 0x3f) | 0x80;
	const hex = hash.subarray(0, 16).toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const buildTechnicianDocument = (technician: IndexableTechnician) =>
	new Document({
		pageContent: [
			`Technician: ${technician.user.name}`,
			`Skills: ${getLabels(technician.skills, SKILLS).join(", ")}`,
			`Areas served: ${getLabels(technician.areas, AREAS).join(", ")}`,
			`Experience: ${technician.experienceYears} years`,
			`Rating: ${technician.ratingAvg}/5 from ${technician.ratingCount} reviews`,
			`Completed jobs: ${technician.completedJobs}`,
			technician.rateMin !== null || technician.rateMax !== null
				? `Rate range: ${technician.rateMin ?? "not set"}-${technician.rateMax ?? "not set"} BDT`
				: "",
			technician.bio ? `About: ${technician.bio}` : "",
		]
			.filter(Boolean)
			.join("\n"),
		metadata: { technicianId: technician.userId },
	});

export const upsertTechnicianEmbedding = async (technicianId: string) => {
	const technician = await prisma.technicianProfile.findUnique({
		where: { userId: technicianId },
		select: {
			...indexableTechnicianSelect,
			verifyStatus: true,
			user: { select: { name: true, status: true } },
		},
	});
	const embeddingId = embeddingIdFor(technicianId);

	await prisma.technicianEmbedding.deleteMany({
		where: { id: embeddingId },
	});

	if (
		!technician ||
		technician.verifyStatus !== VerifyStatus.VERIFIED ||
		technician.user.status !== UserStatus.ACTIVE
	) {
		return;
	}

	await vectorStore.addDocuments([buildTechnicianDocument(technician)], {
		ids: [embeddingId],
	});
};

export const reindexAllTechnicians = async () => {
	const technicians = await prisma.technicianProfile.findMany({
		where: {
			verifyStatus: VerifyStatus.VERIFIED,
			user: { status: UserStatus.ACTIVE },
		},
		select: indexableTechnicianSelect,
	});

	for (let i = 0; i < technicians.length; i += INDEX_BATCH_SIZE) {
		const batch = technicians.slice(i, i + INDEX_BATCH_SIZE);
		const ids = batch.map((technician) => embeddingIdFor(technician.userId));
		await prisma.technicianEmbedding.deleteMany({
			where: { id: { in: ids } },
		});
		await vectorStore.addDocuments(batch.map(buildTechnicianDocument), {
			ids,
		});
	}

	const activeIds = technicians.map((technician) =>
		embeddingIdFor(technician.userId),
	);
	if (activeIds.length) {
		await prisma.technicianEmbedding.deleteMany({
			where: { id: { notIn: activeIds } },
		});
	} else {
		await prisma.technicianEmbedding.deleteMany();
	}

	return technicians.length;
};
