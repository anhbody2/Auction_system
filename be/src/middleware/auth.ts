import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { HttpError } from '../lib/http';

export interface AuthUser {
  id: bigint;
  username: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: { id: bigint; username: string }) {
  return jwt.sign({ sub: user.id.toString(), username: user.username }, config.jwtSecret, { expiresIn: '7d' });
}

function readUser(req: Request): AuthUser | undefined {
  const token = req.cookies?.[config.cookieName];
  if (!token) return undefined;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    return { id: BigInt(payload.sub as string), username: payload.username as string };
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
