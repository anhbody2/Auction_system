import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { getOutbox } from '../src/lib/mailer';
import { PASSWORD, app, registerUser, resetDb } from './helpers';

const resetLinkToken = (email: string) => {
  const mails = getOutbox(email).filter((m) => m.subject === 'Reset your BidHouse password');
  return mails.at(-1)?.text.match(/token=([a-f0-9]+)/)?.[1];
};

describe('cust-004 forgot password', () => {
  beforeAll(async () => {
    await resetDb();
    await registerUser('forgetful');
  });

  it('issues a reset token by email and the token works exactly once', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'forgetful@example.com' });
    expect(res.status).toBe(200);
    const token = resetLinkToken('forgetful@example.com');
    expect(token).toBeDefined();

    const reset = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'Reset1234', confirmPassword: 'Reset1234' });
    expect(reset.status).toBe(200);

    expect((await request(app).post('/api/auth/login').send({ identifier: 'forgetful', password: PASSWORD })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ identifier: 'forgetful', password: 'Reset1234' })).status).toBe(200);

    const reuse = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'Again1234', confirmPassword: 'Again1234' });
    expect(reuse.status).toBe(400);
  });

  it('an older link is invalidated by a newer request', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: 'forgetful@example.com' });
    const first = resetLinkToken('forgetful@example.com');
    await request(app).post('/api/auth/forgot-password').send({ email: 'forgetful@example.com' });
    const res = await request(app).post('/api/auth/reset-password').send({ token: first, newPassword: 'Older1234', confirmPassword: 'Older1234' });
    expect(res.status).toBe(400);
  });

  it('does not leak whether an email is registered', async () => {
    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'forgetful@example.com' });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(getOutbox('ghost@example.com')).toHaveLength(0);
  });
});
