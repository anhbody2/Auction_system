import type { NextFunction, Request, Response } from 'express';
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

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = readUser(req);
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = readUser(req);
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  next();
}

/** Statuses that may not use the API even with a valid token. */
export const BLOCKED_STATUSES = ['locked', 'disabled', 'deleted'];

/**
 * sec-002: role and permissions are read from the DB on every request, so a role change
 * or a revoked permission applies to the very next call (the role in the token is only a hint).
 */
export function requirePermission(code: string) {
  return asyncHandler(async (req, _res, next) => {
    const tokenUser = readUser(req);
    if (!tokenUser) throw new HttpError(401, 'Authentication required');
    const user = await prisma.user.findUnique({ where: { id: tokenUser.id }, select: { role: true, status: true } });
    if (!user || BLOCKED_STATUSES.includes(user.status)) throw new HttpError(401, 'Authentication required');
    const role = (ROLES as readonly string[]).includes(user.role) ? (user.role as Role) : 'customer';
    req.user = { ...tokenUser, role };
    const grant = await prisma.rolePermission.findFirst({ where: { role, permission: { code } } });
    if (!grant) throw new HttpError(403, 'You do not have permission to do this');
    next();
  });
}
