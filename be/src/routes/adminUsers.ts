import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { HttpError, asyncHandler } from '../lib/http';
import { emailField, fullNameField, passwordField, phoneField, usernameField } from '../lib/validation';
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

const createSchema = z.object({
  username: usernameField,
  email: emailField,
  password: passwordField,
  role: z.enum(ROLES, { errorMap: () => ({ message: 'Role must be customer, staff or admin' }) }),
  fullName: fullNameField.optional().or(z.literal('').transform(() => undefined)),
});

/** adm-002: admin-created accounts are active and verified at once (they skip the email confirmation step). */
adminUsersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const taken: Record<string, string> = {};
    if (await prisma.user.findUnique({ where: { email: data.email } })) taken.email = 'Email is already registered';
    if (await prisma.user.findUnique({ where: { username: data.username } })) taken.username = 'Username is already taken';
    if (Object.keys(taken).length) throw new HttpError(409, 'Account already exists', taken);

    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: data.role,
        status: 'active',
        emailVerifiedAt: new Date(),
        info: { create: { fullName: data.fullName ?? null } },
      },
    });
    res.status(201).json({ user: await userDetail(user.id) });
  }),
);

const editSchema = z
  .object({
    email: emailField,
    fullName: fullNameField.nullable().or(z.literal('').transform(() => null)),
    phone: phoneField.nullable().or(z.literal('').transform(() => null)),
    address: z.string().trim().max(500).nullable(),
    role: z.enum(ROLES, { errorMap: () => ({ message: 'Role must be customer, staff or admin' }) }),
    status: z.enum(['active', 'locked'], { errorMap: () => ({ message: 'Status must be active or locked' }) }),
  })
  .partial()
  .strict();

/** adm-003: edit profile fields, role and status. Locking applies to the user's next request. */
adminUsersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseUserId(req.params.id);
    const data = editSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.status === 'deleted') throw new HttpError(404, 'User not found');
    if (id === req.user!.id && ((data.role && data.role !== user.role) || (data.status && data.status !== user.status))) {
      throw new HttpError(400, 'You cannot change your own role or status');
    }
    if (data.email && data.email !== user.email && (await prisma.user.findUnique({ where: { email: data.email } }))) {
      throw new HttpError(409, 'Email is already registered', { email: 'Email is already registered' });
    }
    const info = { fullName: data.fullName, phone: data.phone, address: data.address };
    await prisma.user.update({
      where: { id },
      data: {
        email: data.email,
        role: data.role,
        status: data.status,
        info: { upsert: { create: info, update: info } },
      },
    });
    res.json({ user: await userDetail(id) });
  }),
);
