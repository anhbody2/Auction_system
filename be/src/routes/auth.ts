import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../db';
import { HttpError, asyncHandler } from '../lib/http';
import { sendMail } from '../lib/mailer';
import { hashToken, newToken } from '../lib/tokens';
import { getPublicUser } from '../lib/users';
import { emailField, fullNameField, passwordField, phoneField, usernameField } from '../lib/validation';
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
    if (user.status === 'locked') throw new HttpError(403, 'This account is locked. Contact an administrator.');
    res.cookie(config.cookieName, signToken(user), cookieOptions);
    res.json({ user: await getPublicUser(user.id) });
  }),
);

const registerSchema = z
  .object({
    fullName: fullNameField,
    username: usernameField,
    email: emailField,
    phone: phoneField,
    address: z.string().trim().max(500).optional(),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const taken: Record<string, string> = {};
    if (await prisma.user.findUnique({ where: { email: data.email } })) taken.email = 'Email is already registered';
    if (await prisma.user.findUnique({ where: { username: data.username } })) taken.username = 'Username is already taken';
    if (Object.keys(taken).length) throw new HttpError(409, 'Account already exists', taken);

    const { token, tokenHash } = newToken();
    const user = await prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        passwordHash: await bcrypt.hash(data.password, 10),
        status: 'pending',
        info: { create: { fullName: data.fullName, phone: data.phone, address: data.address || null } },
        verificationTokens: { create: { tokenHash, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) } },
      },
    });
    await sendMail(
      user.email,
      'Confirm your BidHouse account',
      `Hi ${data.fullName},\n\nConfirm your email address by opening this link:\n${config.appUrl}/verify-email?token=${token}\n\nThe link expires in 24 hours.`,
    );
    res.status(201).json({
      message: 'Account created. Check your email to confirm your address.',
      user: await getPublicUser(user.id),
    });
  }),
);

authRouter.post(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new HttpError(400, 'This confirmation link is invalid or has expired');
    }
    await prisma.$transaction([
      prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date(), status: 'active' } }),
    ]);
    res.json({ message: 'Email confirmed' });
  }),
);

const FORGOT_MESSAGE = 'If an account exists for that email, a password reset link has been sent.';

authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: emailField }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.status !== 'disabled') {
      const { token, tokenHash } = newToken();
      await prisma.$transaction([
        // Only the newest link stays valid.
        prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
        prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 3600 * 1000) } }),
      ]);
      await sendMail(
        user.email,
        'Reset your BidHouse password',
        `Someone asked to reset the password for ${user.username}.\n\nSet a new password here:\n${config.appUrl}/reset-password?token=${token}\n\nThe link expires in 1 hour. Ignore this email if it wasn't you.`,
      );
    }
    res.json({ message: FORGOT_MESSAGE });
  }),
);

const resetSchema = z
  .object({ token: z.string().min(1), newPassword: passwordField, confirmPassword: z.string() })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const data = resetSchema.parse(req.body);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(data.token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new HttpError(400, 'This reset link is invalid or has expired');
    }
    await prisma.$transaction([
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await bcrypt.hash(data.newPassword, 10) } }),
    ]);
    res.json({ message: 'Password has been reset. You can now log in.' });
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
