import 'dotenv/config';
import path from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret',
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  isTest: process.env.NODE_ENV === 'test',
  cookieName: 'auction_token',
  /** upl-001: where uploaded images are stored on disk (served at /uploads). */
  get uploadDir() {
    return process.env.UPLOAD_DIR ?? path.resolve(__dirname, '../uploads');
  },
  /** Also settle due auctions before each /api request, so results show without waiting for the hourly job. */
  get settleOnRequest() {
    return process.env.SETTLE_ON_REQUEST !== '0';
  },
};
