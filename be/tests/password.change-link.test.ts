import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { getOutbox } from '../src/lib/mailer';
import { app, loginAs, registerUser, resetDb } from './helpers';

const NEW = 'Brandnew42';
const tokenIn = (text: string) => text.match(/reset-password\?token=([a-f0-9]+)/)![1];
const reset = (token: string, password = NEW) => request(app).post('/api/auth/reset-password').send({ token, newPassword: password, confirmPassword: password });

/** Each case breaks one rule; the message is passwordField's in be/src/lib/validation.ts. */
const WEAK: [string, string][] = [
  ['short1', 'Password must be at least 8 characters'],
  ['abcdefghij', 'Password must contain a number'],
  ['1234567890', 'Password must contain a letter'],
];

describe('mail-003 change password by emailed link', () => {
  beforeEach(async () => {
    await resetDb();
    await registerUser('linky');
  });

  it('a signed-in user asks for a link: a mail goes to their own address and the link sets the password', async () => {
    const agent = await loginAs('linky');
    const res = await agent.post('/api/me/password/link');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('We sent a link to change your password to linky@example.com');
    const mail = getOutbox('linky@example.com').at(-1)!;
    expect(mail.subject).toBe('Change your BidHouse password');
    expect(mail.html).toContain('/reset-password?token=');
    const token = tokenIn(mail.text);
    expect((await prisma.passwordResetToken.findFirstOrThrow({ where: { user: { username: 'linky' }, usedAt: null } })).purpose).toBe('change');

    const ok = await reset(token);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ message: 'Your password has been changed', purpose: 'change' });
    expect((await request(app).post('/api/auth/login').send({ identifier: 'linky', password: NEW })).status).toBe(200);
    // Reused -> 400
    expect((await reset(token, 'Another123')).status).toBe(400);
  });

  it('expired links are 400; guests cannot ask for a change link', async () => {
    const agent = await loginAs('linky');
    await agent.post('/api/me/password/link');
    const token = tokenIn(getOutbox('linky@example.com').at(-1)!.text);
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await reset(token);
    expect(expired.status).toBe(400);
    expect(expired.body.error).toBe('This reset link is invalid or has expired');
    expect((await request(app).post('/api/me/password/link')).status).toBe(401);
  });

  it('saving a new password makes every older link stop working (reset and change)', async () => {
    const agent = await loginAs('linky');
    await request(app).post('/api/auth/forgot-password').send({ email: 'linky@example.com' });
    const forgot = tokenIn(getOutbox('linky@example.com').at(-1)!.text);
    await agent.post('/api/me/password/link');
    const change = tokenIn(getOutbox('linky@example.com').at(-1)!.text);
    // Asking for the change link already replaced the forgot one.
    expect((await reset(forgot)).status).toBe(400);
    expect((await reset(change)).status).toBe(200);
    expect(await prisma.passwordResetToken.count({ where: { user: { username: 'linky' }, usedAt: null } })).toBe(0);

    // Forgot-password links say 'reset' so the page sends the user to log in.
    await request(app).post('/api/auth/forgot-password').send({ email: 'linky@example.com' });
    const again = await reset(tokenIn(getOutbox('linky@example.com').at(-1)!.text), 'Third123x');
    expect(again.body).toMatchObject({ message: 'Password has been reset. You can now log in.', purpose: 'reset' });
  });

  it('weak passwords get the passwordField messages on both the reset and the change link', async () => {
    const agent = await loginAs('linky');
    for (const kind of ['change', 'reset'] as const) {
      if (kind === 'change') await agent.post('/api/me/password/link');
      else await request(app).post('/api/auth/forgot-password').send({ email: 'linky@example.com' });
      const token = tokenIn(getOutbox('linky@example.com').at(-1)!.text);
      for (const [password, message] of WEAK) {
        const res = await reset(token, password);
        expect(res.status, `${kind} ${password}`).toBe(400);
        expect(res.body.fields.newPassword).toBe(message);
      }
      // The link still works after the refusals.
      expect((await reset(token, `Valid${kind}123`)).status).toBe(200);
    }
  });
});
