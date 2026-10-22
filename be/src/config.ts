import 'dotenv/config';
import path from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret',
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  isTest: process.env.NODE_ENV === 'test',
  /** sec-003: short-lived access JWT cookie; renewed through the refresh cookie (docs/session-tokens.md). */
  cookieName: 'auction_token',
  refreshCookieName: 'auction_refresh',
  get accessTokenTtlMs() {
    return Number(process.env.ACCESS_TOKEN_TTL_MS ?? 15 * 60_000);
  },
  /** Absolute lifetime of a session's refresh tokens (rotation keeps the first expiry). */
  get refreshTokenTtlMs() {
    return Number(process.env.REFRESH_TOKEN_TTL_MS ?? 7 * 24 * 3600_000);
  },
  /** A refresh token not used for this long is refused (30 minutes inactive, SRS security). */
  get idleTimeoutMs() {
    return Number(process.env.IDLE_TIMEOUT_MS ?? 30 * 60_000);
  },
  /** Two tabs may refresh with the same cookie at once; within this window that is not treated as theft. */
  get refreshReuseGraceMs() {
    return Number(process.env.REFRESH_REUSE_GRACE_MS ?? 10_000);
  },
  /** upl-001: where uploaded images are stored on disk (served at /uploads). */
  get uploadDir() {
    return process.env.UPLOAD_DIR ?? path.resolve(__dirname, '../uploads');
  },
  /** Also settle due auctions before each /api request, so results show without waiting for the hourly job. */
  get settleOnRequest() {
    return process.env.SETTLE_ON_REQUEST !== '0';
  },
  /** mail-002: least time between two activation emails for one account (default one minute). */
  get activationResendMs() {
    return Number(process.env.ACTIVATION_RESEND_INTERVAL_MS ?? 60_000);
  },
};
