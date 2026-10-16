import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../db';
import { HttpError, asyncHandler } from '../lib/http';
import { getPublicUser } from '../lib/users';
import { requireAuth, signToken } from '../middleware/auth';

export const authRouter = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: false,
  maxAge: 7 * 24 * 3600 * 1000,
};

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { identifier, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier.toLowerCase() }, { username: identifier }] },
    });
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !ok) throw new HttpError(401, 'Invalid username/email or password');
    if (user.status === 'disabled') throw new HttpError(403, 'This account is disabled');
    res.cookie(config.cookieName, signToken(user), cookieOptions);
    res.json({ user: await getPublicUser(user.id) });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(config.cookieName, { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getPublicUser(req.user!.id);
    if (!user) throw new HttpError(401, 'Authentication required');
    res.json({ user });
  }),
);
