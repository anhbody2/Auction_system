import nodemailer from 'nodemailer';
import { HttpError } from './http';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  sentAt: Date;
}

export interface MailContent {
  subject: string;
  text: string;
  html?: string;
}

/** What the transport needs; nodemailer transports satisfy it, tests can pass a fake. */
export interface MailTransport {
  sendMail(message: { from: string; to: string; subject: string; text: string; html?: string }): Promise<unknown>;
}

export const SEND_FAILED_MESSAGE = 'We could not send the email, please try again';

// Without Gmail or SMTP settings, mails are kept in an in-memory outbox (exposed at /api/dev/outbox
// outside production) and logged, so the flows are verifiable without a mail server.
const outbox: Mail[] = [];

/**
 * mail-001: transport options from the environment, read at send time.
 *  - GMAIL_USER + GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET + GMAIL_REFRESH_TOKEN
 *      -> Gmail SMTP (smtp.gmail.com:465, TLS) with OAuth 2.0 (XOAUTH2). Nodemailer gets a fresh access token
 *         from the refresh token when needed; no Gmail password is stored. Sent from the Gmail account.
 *  - SMTP_HOST -> any SMTP server (older setup)
 *  - otherwise -> null: the dev outbox
 */
export function mailSettings(env: NodeJS.ProcessEnv = process.env) {
  const name = env.MAIL_FROM_NAME ?? 'BidHouse';
  if (env.GMAIL_USER && env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN) {
    return {
      kind: 'gmail' as const,
      from: `${name} <${env.GMAIL_USER}>`,
      options: {
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          type: 'OAuth2' as const,
          user: env.GMAIL_USER,
          clientId: env.GMAIL_CLIENT_ID,
          clientSecret: env.GMAIL_CLIENT_SECRET,
          refreshToken: env.GMAIL_REFRESH_TOKEN,
        },
      },
    };
  }
  if (env.SMTP_HOST) {
    return {
      kind: 'smtp' as const,
      from: env.MAIL_FROM ?? `${name} <no-reply@bidhouse.local>`,
      options: {
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? 587),
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      },
    };
  }
  return { kind: 'outbox' as const, from: `${name} <no-reply@bidhouse.local>`, options: null };
}

let override: MailTransport | null = null;
let cached: { key: string; transport: MailTransport } | null = null;

/** Tests only: replace the transport (null restores the environment-based one). */
export function setMailTransport(transport: MailTransport | null) {
  override = transport;
}

function currentTransport(settings: ReturnType<typeof mailSettings>): MailTransport | null {
  if (override) return override;
  if (!settings.options) return null;
  const key = JSON.stringify(settings.options);
  if (cached?.key !== key) cached = { key, transport: nodemailer.createTransport(settings.options) };
  return cached.transport;
}

/** Sends a mail (text, plus HTML when given). A transport failure is logged and thrown. */
export async function sendMail(to: string, subject: string, text: string, html?: string) {
  const mail: Mail = { to, subject, text, html, sentAt: new Date() };
  const settings = mailSettings();
  const transport = currentTransport(settings);
  if (transport) {
    try {
      await transport.sendMail({ from: settings.from, to, subject, text, html });
    } catch (err) {
      console.error(`[mail] sending "${subject}" to ${to} failed:`, err instanceof Error ? err.message : err);
      throw err;
    }
  } else if (process.env.NODE_ENV !== 'test') {
    console.log(`[mail] to=${to} subject="${subject}"\n${text}`);
  }
  outbox.push(mail);
  if (outbox.length > 200) outbox.shift();
  return mail;
}

/** Account mails (activation, password links): a failure becomes 502 with a message the user can act on. */
export async function sendAccountMail(to: string, content: MailContent) {
  try {
    return await sendMail(to, content.subject, content.text, content.html);
  } catch {
    throw new HttpError(502, SEND_FAILED_MESSAGE);
  }
}

export function getOutbox(to?: string) {
  return to ? outbox.filter((m) => m.to === to) : [...outbox];
}
