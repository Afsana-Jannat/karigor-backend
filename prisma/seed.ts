import { reindexAllTechnicians } from "../src/app/modules/chat/chat.indexer.js";
import type { AreaSlug, SkillSlug } from "../src/constants/index.js";
import { prisma } from "../src/lib/prisma.js";

type SeedTechnician = {
	name: string;
	phone: string;
	age: number;
	bio: string;
	experienceYears: number;
	skills: SkillSlug[];
	areas: AreaSlug[];
	rateMin: number;
	rateMax: number;
	ratingAvg: number;
	ratingCount: number;
	completedJobs: number;
};

const customer = {
	name: "Karigor Demo Customer",
	phone: "+8801999000099",
};

const technicians: SeedTechnician[] = [
	{
		name: "Rahim Uddin",
		phone: "+8801999000001",
		age: 34,
		bio: "Experienced electrician for home wiring, switches, and electrical repairs.",
		experienceYears: 10,
		skills: ["electrician"],
		areas: ["mirpur", "pallabi"],
		rateMin: 500,
		rateMax: 2500,
		ratingAvg: 4.8,
		ratingCount: 34,
		completedJobs: 82,
	},
	{
		name: "Karim Mia",
		phone: "+8801999000002",
		age: 39,
		bio: "Residential plumber experienced with water lines, taps, and bathroom fittings.",
		experienceYears: 12,
		skills: ["plumber"],
		areas: ["dhanmondi", "mohammadpur"],
		rateMin: 400,
		rateMax: 2000,
		ratingAvg: 4.7,
		ratingCount: 28,
		completedJobs: 67,
	},
	{
		name: "Sajjad Hossain",
		phone: "+8801999000003",
		age: 31,
		bio: "AC installation, servicing, and troubleshooting for apartments and offices.",
		experienceYears: 8,
		skills: ["ac_repairer"],
		areas: ["gulshan", "banani"],
		rateMin: 800,
		rateMax: 3500,
		ratingAvg: 4.9,
		ratingCount: 41,
		completedJobs: 96,
	},
	{
		name: "Mizanur Rahman",
		phone: "+8801999000004",
		age: 42,
		bio: "Carpenter specializing in furniture repair, doors, and custom woodwork.",
		experienceYears: 16,
		skills: ["carpenter"],
		areas: ["uttara", "abdullapur"],
		rateMin: 700,
		rateMax: 4000,
		ratingAvg: 4.6,
		ratingCount: 22,
		completedJobs: 58,
	},
	{
		name: "Babul Sheikh",
		phone: "+8801999000005",
		age: 37,
		bio: "Reliable painter for interior walls, surface preparation, and repainting.",
		experienceYears: 11,
		skills: ["painter"],
		areas: ["badda", "aftabnagar"],
		rateMin: 600,
		rateMax: 3000,
		ratingAvg: 4.5,
		ratingCount: 19,
		completedJobs: 51,
	},
	{
		name: "Nayan Chandra",
		phone: "+8801999000006",
		age: 35,
		bio: "Mason experienced in brickwork, plastering, and small home renovations.",
		experienceYears: 13,
		skills: ["mason", "tiles_worker"],
		areas: ["jatrabari", "demra"],
		rateMin: 800,
		rateMax: 5000,
		ratingAvg: 4.7,
		ratingCount: 25,
		completedJobs: 73,
	},
	{
		name: "Shamim Ahmed",
		phone: "+8801999000007",
		age: 29,
		bio: "CCTV camera installation, setup, and basic network troubleshooting.",
		experienceYears: 6,
		skills: ["cctv_installer", "internet_line_worker"],
		areas: ["farmgate", "karwan_bazar"],
		rateMin: 700,
		rateMax: 3000,
		ratingAvg: 4.8,
		ratingCount: 17,
		completedJobs: 39,
	},
	{
		name: "Rafiqul Islam",
		phone: "+8801999000008",
		age: 45,
		bio: "Experienced car mechanic for routine servicing and common vehicle repairs.",
		experienceYears: 20,
		skills: ["car_mechanic"],
		areas: ["mohammadpur", "gabtoli"],
		rateMin: 1000,
		rateMax: 6000,
		ratingAvg: 4.6,
		ratingCount: 31,
		completedJobs: 104,
	},
	{
		name: "Al Amin",
		phone: "+8801999000009",
		age: 33,
		bio: "Water pump and household motor repair, installation, and maintenance.",
		experienceYears: 9,
		skills: ["water_pump_worker", "electrician"],
		areas: ["khilgaon", "malibagh"],
		rateMin: 500,
		rateMax: 2800,
		ratingAvg: 4.7,
		ratingCount: 21,
		completedJobs: 62,
	},
	{
		name: "Jamal Uddin",
		phone: "+8801999000010",
		age: 40,
		bio: "Professional welder for grills, gates, and general metal repairs.",
		experienceYears: 15,
		skills: ["welder"],
		areas: ["mirpur", "kafrul"],
		rateMin: 800,
		rateMax: 4500,
		ratingAvg: 4.5,
		ratingCount: 16,
		completedJobs: 47,
	},
];

async function main() {
	const seededCustomer = await prisma.user.upsert({
		where: { phone: customer.phone },
		update: {
			name: customer.name,
			role: "CUSTOMER",
			status: "ACTIVE",
			isVerified: true,
		},
		create: {
			...customer,
			role: "CUSTOMER",
			status: "ACTIVE",
			isVerified: true,
		},
	});

	for (const technician of technicians) {
		const user = await prisma.user.upsert({
			where: { phone: technician.phone },
			update: {
				name: technician.name,
				role: "TECHNICIAN",
				status: "ACTIVE",
				isVerified: true,
			},
			create: {
				name: technician.name,
				phone: technician.phone,
				role: "TECHNICIAN",
				status: "ACTIVE",
				isVerified: true,
			},
		});

		const { name: _name, phone: _phone, ...profile } = technician;
		await prisma.technicianProfile.upsert({
			where: { userId: user.id },
			update: {
				...profile,
				isAvailableNow: true,
				verifyStatus: "VERIFIED",
				photoUrl: null,
				rejectReason: null,
			},
			create: {
				userId: user.id,
				...profile,
				isAvailableNow: true,
				verifyStatus: "VERIFIED",
			},
		});
	}

	const indexedCount = await reindexAllTechnicians();

	console.log("Seed completed (existing data was preserved).");
	console.log(`Customer: ${seededCustomer.name} (${seededCustomer.phone})`);
	console.log(`Technicians created/updated: ${technicians.length}`);
	console.log(`Active verified technicians indexed: ${indexedCount}`);
}

main()
	.catch((error) => {
		console.error("Seed failed:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
