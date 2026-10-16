import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret',
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  isTest: process.env.NODE_ENV === 'test',
  cookieName: 'auction_token',
  /** Also settle due auctions before each /api request, so results show without waiting for the hourly job. */
  get settleOnRequest() {
    return process.env.SETTLE_ON_REQUEST !== '0';
  },
};
