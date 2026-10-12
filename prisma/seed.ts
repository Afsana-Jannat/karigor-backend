import {prisma} from "../src/lib/prisma"

async function main() {
  console.log('🌱 Starting database seeding on Neon DB...');

  // 1. Clean existing records to avoid unique constraint collisions
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

  // 3. Create Active Technician
  const technician = await prisma.user.create({
    data: {
      name: 'Jane Smith',
      phone: '+15559876543',
      role: 'TECHNICIAN',
      status: 'ACTIVE',
      isVerified: true,
      tokenVersion: 1,
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
    // Notice: Cleaned up dynamic string resolution for ESM compatibility
    await prisma.$disconnect();
  });
