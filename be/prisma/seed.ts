import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { INCREMENT_LADDER } from '../src/lib/increments';

const prisma = new PrismaClient();

// Demo accounts, password for all: Password123!
const DEMO_USERS = [
  { username: 'alice', email: 'alice@example.com', fullName: 'Alice Seller', credit: 1000 },
  { username: 'bob', email: 'bob@example.com', fullName: 'Bob Bidder', credit: 1000 },
  { username: 'carol', email: 'carol@example.com', fullName: 'Carol Customer', credit: 500 },
];

// Internal accounts (sec-001), same password. Documented in docs/accounts.md.
const STAFF_USERS = [
  { username: 'staff', email: 'staff@example.com', fullName: 'Sam Staff', role: 'staff' },
  { username: 'admin', email: 'admin@example.com', fullName: 'Ada Admin', role: 'admin' },
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
  for (const u of STAFF_USERS) {
    await client.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        username: u.username,
        passwordHash,
        role: u.role,
        status: 'active',
        emailVerifiedAt: new Date(),
        info: { create: { fullName: u.fullName } },
      },
    });
  }
  for (const name of ['Electronics', 'Collectibles', 'Fashion', 'Home and Garden', 'Art', 'Vehicles']) {
    await client.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  // Keep BID_INCREMENT_RULES in step with the ladder the API applies (bid-003).
  await client.$transaction([
    client.bidIncrementRule.deleteMany(),
    client.bidIncrementRule.createMany({
      data: INCREMENT_LADDER.map((t) => ({ minBidAmount: t.from, maxBidAmount: t.to, incrementAmount: t.increment })),
    }),
  ]);
}

if (require.main === module) {
  seed()
    .then(() => console.log('Seed complete'))
    .finally(() => prisma.$disconnect());
}
