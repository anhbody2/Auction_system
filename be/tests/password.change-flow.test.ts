import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { getOutbox } from '../src/lib/mailer';
import { changePasswordMail, passwordLinkMail, resetPasswordMail } from '../src/lib/mailTemplates';
import { hashToken } from '../src/lib/tokens';
import { PASSWORD, app, loginAs, refreshWith, registerUser, resetDb, setCookie } from './helpers';

const NEW = 'Changed2026x';
// The dev outbox is not cleared between tests: count mails relative to before.
const changeMails = () => getOutbox('flow@example.com').filter((m) => m.subject === 'Change your BidHouse password');
const tokenIn = (text: string) => text.match(/change-password\/new\?token=([a-f0-9]+)/)![1];
const save = (agent: ReturnType<typeof request.agent> | ReturnType<typeof request>, token: string) =>
  agent.post('/api/auth/reset-password').send({ token, newPassword: NEW, confirmPassword: NEW });

describe('mail-004 change password flow: emailed link, check-mail screen, change-password page', () => {
  beforeEach(async () => {
    await resetDb();
    await registerUser('flow');
  });

  afterEach(() => {
    delete process.env.PASSWORD_LINK_INTERVAL_MS;
  });

  it('the link request mails the own address with a /change-password/new link in the shared password-link template', async () => {
    const agent = await loginAs('flow');
    const before = changeMails().length;
    const res = await agent.post('/api/me/password/link');
    expect(res.status).toBe(200);
    expect(changeMails()).toHaveLength(before + 1);
    const mail = changeMails().at(-1)!;
    expect(mail.text).toMatch(/^Hi flow, you asked to change your password\.\n\nChoose a new password here:\nhttp:\/\/\S+\/change-password\/new\?token=[a-f0-9]+\n\nThe link expires in 1 hour\./);
    expect(mail.html).toContain('>Change your password</h1>');
    expect(mail.html).toContain('>Choose a new password</a>');
    expect(mail.html).not.toContain('/reset-password');
  });

  it('a second request within the interval is 429 and sends nothing; with no interval the older link dies', async () => {
    const agent = await loginAs('flow');
    await agent.post('/api/me/password/link');
    const sent = changeMails().length;
    const again = await agent.post('/api/me/password/link');
    expect(again.status).toBe(429);
    expect(again.body.error).toBe('Please wait a minute before asking for another email');
    expect(changeMails()).toHaveLength(sent);

    process.env.PASSWORD_LINK_INTERVAL_MS = '0';
    const first = tokenIn(getOutbox('flow@example.com').at(-1)!.text);
    expect((await agent.post('/api/me/password/link')).status).toBe(200);
    const second = tokenIn(getOutbox('flow@example.com').at(-1)!.text);
    expect((await save(request(app), first)).status).toBe(400);
    expect((await save(request(app), second)).status).toBe(200);
  });

  it('a forgot-password request does not count toward the change-link interval', async () => {
    const agent = await loginAs('flow');
    await request(app).post('/api/auth/forgot-password').send({ email: 'flow@example.com' });
    expect((await agent.post('/api/me/password/link')).status).toBe(200);
  });

  it('saved in the signed-in browser: every old session is revoked, this browser gets a new one, back to /profile', async () => {
    const agent = await loginAs('flow');
    const other = await request(app).post('/api/auth/login').send({ identifier: 'flow', password: PASSWORD });
    const otherRefresh = setCookie(other, 'auction_refresh')!.value;
    await agent.post('/api/me/password/link');
    const res = await save(agent, tokenIn(getOutbox('flow@example.com').at(-1)!.text));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Your password has been changed', purpose: 'change', next: '/profile' });
    const fresh = setCookie(res, 'auction_refresh')!.value;
    expect((await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashToken(fresh) } })).revokedAt).toBeNull();
    expect((await refreshWith(otherRefresh)).status).toBe(401);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('saved signed out (another device): no session is started and the user is sent to log in', async () => {
    const agent = await loginAs('flow');
    await agent.post('/api/me/password/link');
    const res = await save(request(app), tokenIn(getOutbox('flow@example.com').at(-1)!.text));
    expect(res.body).toEqual({ message: 'Your password has been changed, please log in', purpose: 'change', next: '/login' });
    expect(setCookie(res, 'auction_refresh')).toBeUndefined();
    expect((await request(app).post('/api/auth/login').send({ identifier: 'flow', password: NEW })).status).toBe(200);
  });

  it('saved while signed in as someone else: that session is left alone and no session is started for the owner', async () => {
    const bob = await loginAs('bob');
    const owner = await loginAs('flow');
    await owner.post('/api/me/password/link');
    const res = await save(bob, tokenIn(getOutbox('flow@example.com').at(-1)!.text));
    expect(res.body.next).toBe('/login');
    expect(setCookie(res, 'auction_refresh')).toBeUndefined();
    expect((await bob.get('/api/auth/me')).body.user.username).toBe('bob');
  });

  it('forgot-password links still land on /login', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: 'flow@example.com' });
    const token = getOutbox('flow@example.com').at(-1)!.text.match(/reset-password\?token=([a-f0-9]+)/)![1];
    expect((await save(request(app), token)).body).toEqual({ message: 'Password has been reset. You can now log in.', purpose: 'reset', next: '/login' });
  });
});

describe('mail-004 one template for reset and change mails', () => {
  const link = 'http://localhost:5173/x?token=abc';

  it('both come from passwordLinkMail and differ only in subject, heading, intro, button and footer', () => {
    expect(resetPasswordMail('ann', link)).toEqual(passwordLinkMail('reset', 'ann', link));
    expect(changePasswordMail('ann', link)).toEqual(passwordLinkMail('change', 'ann', link));
    // Same HTML skeleton once the action words are blanked out.
    const skeleton = (html: string) =>
      html.replace(/<h1[^>]*>[^<]*<\/h1>/, '').replace(/(<p style="font-size:15px[^>]*>)[^<]*/, '$1').replace(/(<a href="[^"]*" style="display:inline-block[^>]*>)[^<]*/, '$1').replace(/(<p style="font-size:13px;color:#5c6370;margin:0">)[^<]*/, '$1');
    expect(skeleton(resetPasswordMail('ann', link).html)).toBe(skeleton(changePasswordMail('ann', link).html));
    for (const kind of ['reset', 'change'] as const) {
      const mail = passwordLinkMail(kind, 'ann', link);
      expect(mail.text).toContain(`here:\n${link}\n\nThe link expires in 1 hour.`);
    }
  });
});
