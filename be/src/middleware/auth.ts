import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../db';
import { HttpError, asyncHandler } from '../lib/http';

export const ROLES = ['customer', 'staff', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: bigint;
  username: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: { id: bigint; username: string; role: string }) {
  return jwt.sign({ sub: user.id.toString(), username: user.username, role: user.role }, config.jwtSecret, {
    expiresIn: '7d',
  });
}

function readUser(req: Request): AuthUser | undefined {
  const token = req.cookies?.[config.cookieName];
  if (!token) return undefined;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    // Tokens issued before roles existed carry no role; those users are customers.
    const role = (ROLES as readonly string[]).includes(payload.role) ? (payload.role as Role) : 'customer';
    return { id: BigInt(payload.sub as string), username: payload.username as string, role };
  } catch {
    return undefined;
  }
}

/** Statuses that may not use the API even with a valid token. */
export const BLOCKED_STATUSES = ['locked', 'disabled', 'deleted'];

/**
 * Checks the token, then re-reads role and status from the DB so a role change, lock or delete
 * applies to the very next request (the role in the token is only a hint). undefined = anonymous.
 */
async function loadSessionUser(req: Request): Promise<AuthUser | undefined> {
  const tokenUser = readUser(req);
  if (!tokenUser) return undefined;
  const user = await prisma.user.findUnique({ where: { id: tokenUser.id }, select: { role: true, status: true } });
  if (!user || BLOCKED_STATUSES.includes(user.status)) return undefined;
  const role = (ROLES as readonly string[]).includes(user.role) ? (user.role as Role) : 'customer';
  return { ...tokenUser, role };
}

export const optionalAuth = asyncHandler(async (req, _res, next) => {
  req.user = await loadSessionUser(req);
  next();
});

export const requireAuth = asyncHandler(async (req, _res, next) => {
  req.user = await loadSessionUser(req);
  if (!req.user) throw new HttpError(401, 'Authentication required');
  next();
});

/** sec-002: role and permissions are read from the DB on every request. */
export function requirePermission(code: string) {
  return asyncHandler(async (req, _res, next) => {
    req.user = await loadSessionUser(req);
    if (!req.user) throw new HttpError(401, 'Authentication required');
    const grant = await prisma.rolePermission.findFirst({ where: { role: req.user.role, permission: { code } } });
    if (!grant) throw new HttpError(403, 'You do not have permission to do this');
    next();
  });
}
