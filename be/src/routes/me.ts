import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { streamUser } from '../lib/events';
import { HttpError, asyncHandler } from '../lib/http';
import { getPublicUser } from '../lib/users';
import { emailField, fullNameField, passwordField, phoneField } from '../lib/validation';
import { requireAuth } from '../middleware/auth';

export const meRouter = Router();
meRouter.use(requireAuth);

/** crd-003: the signed-in user's own events ('outbid', 'auction-finished') as Server-Sent Events. */
meRouter.get('/events', (req, res) => streamUser(req, res, req.user!.id));

meRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    res.json({ user: await getPublicUser(req.user!.id) });
  }),
);

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordField,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current one',
  });

meRouter.put(
  '/password',
  asyncHandler(async (req, res) => {
    const data = passwordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(data.currentPassword, user.passwordHash))) {
      throw new HttpError(400, 'Current password is incorrect', { currentPassword: 'Current password is incorrect' });
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(data.newPassword, 10) } });
    res.json({ message: 'Password changed' });
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
