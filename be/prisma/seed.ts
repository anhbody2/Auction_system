import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Demo accounts, password for all: Password123!
const DEMO_USERS = [
  { username: 'alice', email: 'alice@example.com', fullName: 'Alice Seller', credit: 1000 },
  { username: 'bob', email: 'bob@example.com', fullName: 'Bob Bidder', credit: 1000 },
  { username: 'carol', email: 'carol@example.com', fullName: 'Carol Customer', credit: 500 },
];

export async function seed(client: PrismaClient = prisma) {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  for (const u of DEMO_USERS) {
    await client.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        username: u.username,
        passwordHash,
        status: 'active',
        emailVerifiedAt: new Date(),
        creditBalance: u.credit,
        info: { create: { fullName: u.fullName } },
        transactions: {
          create: { transactionType: 'topup', amount: u.credit, balanceBefore: 0, balanceAfter: u.credit, description: 'Opening balance' },
        },
      },
    });
  }
  for (const name of ['Electronics', 'Collectibles', 'Fashion', 'Home and Garden', 'Art', 'Vehicles']) {
    await client.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  if ((await client.bidIncrementRule.count()) === 0) {
    await client.bidIncrementRule.createMany({
      data: [
        { minBidAmount: 0, maxBidAmount: 100, incrementAmount: 1 },
        { minBidAmount: 100, maxBidAmount: 1000, incrementAmount: 5 },
        { minBidAmount: 1000, maxBidAmount: null, incrementAmount: 25 },
      ],
    });
  }
}

if (require.main === module) {
  seed()
    .then(() => console.log('Seed complete'))
    .finally(() => prisma.$disconnect());
}
