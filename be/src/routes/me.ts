import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { HttpError, asyncHandler } from '../lib/http';
import { getPublicUser } from '../lib/users';
import { emailField, fullNameField, phoneField } from '../lib/validation';
import { requireAuth } from '../middleware/auth';

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    res.json({ user: await getPublicUser(req.user!.id) });
  }),
);

const profileSchema = z.object({
  fullName: fullNameField,
  email: emailField,
  phone: phoneField,
  address: z.string().trim().max(500).optional().default(''),
});

meRouter.put(
  '/profile',
  asyncHandler(async (req, res) => {
    const data = profileSchema.parse(req.body);
    const userId = req.user!.id;
    const current = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const emailChanged = data.email !== current.email;
    if (emailChanged && (await prisma.user.findUnique({ where: { email: data.email } }))) {
      throw new HttpError(409, 'Email is already registered', { email: 'Email is already registered' });
    }
    const info = { fullName: data.fullName, phone: data.phone, address: data.address || null };
    await prisma.user.update({
      where: { id: userId },
      data: {
        email: data.email,
        ...(emailChanged ? { emailVerifiedAt: null } : {}),
        info: { upsert: { create: info, update: info } },
      },
    });
    res.json({ message: 'Profile saved', user: await getPublicUser(userId) });
  }),
);
