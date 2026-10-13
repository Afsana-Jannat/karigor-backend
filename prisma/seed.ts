// Fixed named import and added absolute ESM .js file extension resolution
import { prisma } from '../src/lib/prisma.js';

async function main() {
  console.log('🌱 Starting database seeding on Neon DB...');

   await prisma.review.deleteMany({});
  await prisma.bid.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.technicianProfile.deleteMany({});
  await prisma.notification.deleteMany({});
  // 1. Clean existing records to avoid unique constraint collisions
  // (Because of onDelete: Cascade in your schema, deleting users automatically deletes profiles)
  await prisma.user.deleteMany({});

  // 2. Create Active Customer
  const customer = await prisma.user.create({
    data: {
      name: 'John Doe',
      phone: '+15551234567',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      isVerified: true,
      tokenVersion: 1,
    },
  });

  // 3. Create Active Technician with integrated profile relation execution
  const technician = await prisma.user.create({
    data: {
      name: 'Jane Smith',
      phone: '+15559876543',
      role: 'TECHNICIAN',
      status: 'ACTIVE',
      isVerified: true,
      tokenVersion: 1,
      technicianProfile: {
        create: {
          age: 28,
          bio: 'Professional certified electrician with a decade of field experience troubleshooting residential grids.',
          experienceYears: 8,
          skills: ['Electrical', 'Wiring', 'Generator Repair'],
          areas: ['Mirpur', 'Dhanmondi', 'Gulshan'],
          rateMin: 500,
          rateMax: 2500,
          isAvailableNow: true,
          photoUrl: 'https://example.com',
          verifyStatus: 'VERIFIED',
          ratingAvg: 4.8,
          ratingCount: 15,
          completedJobs: 42,
        },
      },
    },
    include: {
      technicianProfile: true,
    },
  });

  console.log('✅ Seeding completed successfully!');
  console.log(`👤 Customer ID : ${customer.id}`);
  console.log(`🛠️ Technician ID: ${technician.id}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });