import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { HttpError, asyncHandler } from '../lib/http';
import { ROLES, requirePermission } from '../middleware/auth';

export const USER_STATUSES = ['active', 'pending', 'locked', 'deleted'] as const;

export const adminUsersRouter = Router();
adminUsersRouter.use(requirePermission('user.manage'));

type UserRow = Prisma.UserGetPayload<{ include: { info: true } }>;

function listView(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    status: u.status,
    fullName: u.info?.fullName ?? null,
    createdAt: u.createdAt,
  };
}

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional().or(z.literal('').transform(() => undefined)),
  status: z.enum(USER_STATUSES).optional().or(z.literal('').transform(() => undefined)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** adm-001: paginated user list; deleted users are hidden unless asked for by status. */
adminUsersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, role, status, page, pageSize } = listQuery.parse(req.query);
    const where: Prisma.UserWhereInput = {
      ...(q ? { OR: [{ username: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
      ...(role ? { role } : {}),
      status: status ?? { not: 'deleted' },
    };
    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: { info: true },
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    res.json({ users: users.map(listView), total, page, pageSize });
  }),
);

export function parseUserId(raw: string) {
  if (!/^\d{1,18}$/.test(raw)) throw new HttpError(404, 'User not found');
  return BigInt(raw);
}

export async function userDetail(id: bigint) {
  const u = await prisma.user.findUnique({
    where: { id },
    include: { info: true, _count: { select: { auctions: true, bids: true } } },
  });
  if (!u) throw new HttpError(404, 'User not found');
  return {
    ...listView(u),
    phone: u.info?.phone ?? null,
    address: u.info?.address ?? null,
    emailVerified: !!u.emailVerifiedAt,
    creditBalance: u.creditBalance,
    heldBalance: u.heldBalance,
    updatedAt: u.updatedAt,
    auctionCount: u._count.auctions,
    bidCount: u._count.bids,
  };
}

adminUsersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ user: await userDetail(parseUserId(req.params.id)) });
  }),
);
