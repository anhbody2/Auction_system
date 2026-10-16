import nodemailer from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  sentAt: Date;
}

// Without SMTP_HOST, mails are kept in an in-memory outbox (exposed at /api/dev/outbox
// outside production) and logged, so the flows are verifiable without a mail server.
const outbox: Mail[] = [];

const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

export async function sendMail(to: string, subject: string, text: string) {
  const mail = { to, subject, text, sentAt: new Date() };
  outbox.push(mail);
  if (outbox.length > 200) outbox.shift();
  if (transport) {
    await transport.sendMail({ from: process.env.MAIL_FROM ?? 'BidHouse <no-reply@bidhouse.local>', to, subject, text });
  } else if (process.env.NODE_ENV !== 'test') {
    console.log(`[mail] to=${to} subject="${subject}"\n${text}`);
  }
  return mail;
}

export function getOutbox(to?: string) {
  return to ? outbox.filter((m) => m.to === to) : [...outbox];
}
