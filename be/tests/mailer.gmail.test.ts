import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { SEND_FAILED_MESSAGE, getOutbox, mailSettings, sendMail, setMailTransport, type MailTransport } from '../src/lib/mailer';
import { activationMail, changePasswordMail, resetPasswordMail } from '../src/lib/mailTemplates';
import { app, resetDb } from './helpers';

const failing: MailTransport = { sendMail: () => Promise.reject(new Error('535 Username and Password not accepted')) };
const register = (username: string) =>
  request(app).post('/api/auth/register').send({
    fullName: 'Mail Tester',
    username,
    email: `${username}@example.com`,
    phone: '0900000000',
    password: 'Password123!',
    confirmPassword: 'Password123!',
  });

describe('mail-001 Gmail transport', () => {
  it('with GMAIL_USER and GMAIL_APP_PASSWORD it uses Gmail (smtp.gmail.com, TLS) and sends from that account', () => {
    const s = mailSettings({ GMAIL_USER: 'bidhouse.app@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' });
    expect(s.kind).toBe('gmail');
    expect(s.options).toMatchObject({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: 'bidhouse.app@gmail.com', pass: 'abcd efgh ijkl mnop' },
    });
    expect(s.from).toBe('BidHouse <bidhouse.app@gmail.com>');
    expect(mailSettings({ GMAIL_USER: 'x@gmail.com', GMAIL_APP_PASSWORD: 'p', MAIL_FROM_NAME: 'Auctions' }).from).toBe('Auctions <x@gmail.com>');
  });

  it('without Gmail settings it falls back to SMTP_HOST, then to the dev outbox', () => {
    expect(mailSettings({ SMTP_HOST: 'smtp.example.com' }).kind).toBe('smtp');
    expect(mailSettings({}).kind).toBe('outbox');
    expect(mailSettings({ GMAIL_USER: 'only-user@gmail.com' }).kind).toBe('outbox');
    expect(mailSettings({}).options).toBeNull();
  });

  it('each template has HTML with a button and a text fallback with the same link', () => {
    const link = 'http://localhost:5173/some-page?token=abc123';
    for (const mail of [activationMail('Ann', link), resetPasswordMail('ann', link), changePasswordMail('ann', link)]) {
      expect(mail.text).toContain(link);
      expect(mail.html).toContain(`href="${link}"`);
      expect(mail.html).toMatch(/<a href="[^"]+" style="display:inline-block/);
      expect(mail.subject).toBeTruthy();
    }
    expect(activationMail('<b>Ann</b>', link).html).not.toContain('<b>Ann</b>');
  });

  it('the transport gets from, to, subject, text and html', async () => {
    const sent: Parameters<MailTransport['sendMail']>[0][] = [];
    setMailTransport({ sendMail: async (m) => void sent.push(m) });
    try {
      await sendMail('ann@example.com', 'Hello', 'plain', '<p>html</p>');
    } finally {
      setMailTransport(null);
    }
    expect(sent[0]).toMatchObject({ to: 'ann@example.com', subject: 'Hello', text: 'plain', html: '<p>html</p>' });
    expect(sent[0].from).toContain('BidHouse');
  });
});

describe('mail-001 send failures', () => {
  beforeEach(resetDb);
  afterEach(() => setMailTransport(null));

  it('register: 502 with a clear message; the account stays pending with an unused token so a resend works', async () => {
    setMailTransport(failing);
    const res = await register('mailfail');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe(SEND_FAILED_MESSAGE);
    const user = await prisma.user.findUniqueOrThrow({ where: { username: 'mailfail' }, include: { verificationTokens: true } });
    expect(user.status).toBe('pending');
    expect(user.verificationTokens.filter((t) => !t.usedAt)).toHaveLength(1);
    expect(getOutbox('mailfail@example.com')).toEqual([]);
  });

  it('forgot password: 502 with the message; asking again once mail works sends a fresh link', async () => {
    await register('forgetful');
    setMailTransport(failing);
    const failed = await request(app).post('/api/auth/forgot-password').send({ email: 'forgetful@example.com' });
    expect(failed.status).toBe(502);
    expect(failed.body.error).toBe(SEND_FAILED_MESSAGE);
    setMailTransport(null);
    const ok = await request(app).post('/api/auth/forgot-password').send({ email: 'forgetful@example.com' });
    expect(ok.status).toBe(200);
    const mail = getOutbox('forgetful@example.com').at(-1)!;
    expect(mail.subject).toBe('Reset your BidHouse password');
    expect(mail.html).toContain('/reset-password?token=');
  });
});
