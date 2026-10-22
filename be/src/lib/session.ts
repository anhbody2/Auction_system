import type { CookieOptions, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../db';
import { signToken } from '../middleware/auth';
import { hashToken, newToken } from './tokens';

/**
 * sec-003: a session is a short-lived access JWT (cookie config.cookieName, read by middleware/auth.ts) plus a
 * refresh token (cookie config.refreshCookieName, path /api/auth). Only the refresh token's hash is stored.
 * Every refresh rotates it; see docs/session-tokens.md.
 */
export type RevokeReason = 'rotated' | 'reuse' | 'logout' | 'idle' | 'password' | 'locked' | 'deleted';

type SessionUser = { id: bigint; username: string; role: string };
type Db = Prisma.TransactionClient | typeof prisma;

const baseCookie: CookieOptions = { httpOnly: true, sameSite: 'lax', secure: false };
const REFRESH_PATH = '/api/auth';

async function issueRefreshToken(db: Db, userId: bigint, expiresAt = new Date(Date.now() + config.refreshTokenTtlMs)) {
  const { token, tokenHash } = newToken();
  const row = await db.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  return { token, row };
}

function setCookies(res: Response, user: SessionUser, refreshToken: string) {
  res.cookie(config.cookieName, signToken(user), { ...baseCookie, maxAge: config.accessTokenTtlMs });
  res.cookie(config.refreshCookieName, refreshToken, { ...baseCookie, path: REFRESH_PATH, maxAge: config.refreshTokenTtlMs });
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(config.cookieName, baseCookie);
  res.clearCookie(config.refreshCookieName, { ...baseCookie, path: REFRESH_PATH });
}

/** Login and activation sign-in: a new access cookie and a new refresh token. */
export async function startSession(res: Response, user: SessionUser) {
  const { token } = await issueRefreshToken(prisma, user.id);
  setCookies(res, user, token);
}

export class RefreshError extends Error {}

/**
 * Exchanges a refresh token for a new pair. The old token is revoked ('rotated') in the same statement that
 * checks it is still open, so two requests cannot both rotate it. Presenting a token that was rotated earlier
 * than config.refreshReuseGraceMs ago is treated as theft: every open token of that user is revoked ('reuse').
 * Within the grace window (two tabs refreshing at once with the same cookie) the late request gets its own pair.
 */
export async function rotateSession(res: Response, presented: string | undefined) {
  if (!presented) throw new RefreshError('No refresh token');
  const now = new Date();
  const current = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(presented) }, include: { user: true } });
  if (!current) throw new RefreshError('Unknown refresh token');
  const { user } = current;
  if (user.status !== 'active' && user.status !== 'pending') throw new RefreshError('Account cannot sign in');

  if (current.revokedAt) {
    const raced = current.revokeReason === 'rotated' && now.getTime() - current.revokedAt.getTime() <= config.refreshReuseGraceMs;
    if (!raced) {
      if (current.revokeReason === 'rotated') await revokeAllSessions(user.id, 'reuse');
      throw new RefreshError('Refresh token was revoked');
    }
  } else {
    if (current.expiresAt <= now) throw new RefreshError('Refresh token expired');
    if (now.getTime() - current.lastUsedAt.getTime() > config.idleTimeoutMs) {
      await prisma.refreshToken.updateMany({ where: { id: current.id, revokedAt: null }, data: { revokedAt: now, revokeReason: 'idle' } });
      throw new RefreshError('Session idle for too long');
    }
  }

  const token = await prisma.$transaction(async (tx) => {
    if (!current.revokedAt) {
      const won = await tx.refreshToken.updateMany({ where: { id: current.id, revokedAt: null }, data: { revokedAt: now, revokeReason: 'rotated' } });
      // Another request rotated it between the read and here: same as the grace case.
      if (won.count === 0 && !(await tx.refreshToken.findFirst({ where: { id: current.id, revokeReason: 'rotated' } }))) {
        throw new RefreshError('Refresh token was revoked');
      }
    }
    // The new token keeps the absolute expiry of the session it replaces.
    const next = await issueRefreshToken(tx, user.id, current.expiresAt);
    if (!current.revokedAt) await tx.refreshToken.update({ where: { id: current.id }, data: { replacedById: next.row.id } });
    return next.token;
  });
  setCookies(res, user, token);
  return user;
}

/** Logout: revokes the presented refresh token (if any is still open). */
export async function endSession(presented: string | undefined, reason: 'logout' | 'idle') {
  if (!presented) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(presented), revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: reason },
  });
}

/** Password change/reset, lock, delete, or token reuse: no open session of the user can be renewed. */
export function revokeAllSessions(userId: bigint, reason: RevokeReason, db: Db = prisma) {
  return db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
}
