import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { HttpError } from '../lib/http';

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
