import type { MailContent } from './mailer';

/**
 * mail-001: account emails. Each has an HTML body with a button and a plain-text fallback that carries
 * the same link, so the mail works in any client.
 */
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(opts: { heading: string; intro: string; button: string; link: string; footer: string }) {
  const { heading, intro, button, link, footer } = opts;
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2430">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:8px;padding:28px" cellspacing="0" cellpadding="0">
      <tr><td>
        <h1 style="font-size:20px;margin:0 0 12px">${escape(heading)}</h1>
        <p style="font-size:15px;line-height:1.5;margin:0 0 20px">${escape(intro)}</p>
        <p style="margin:0 0 24px"><a href="${escape(link)}" style="display:inline-block;background:#3b5bdb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold">${escape(button)}</a></p>
        <p style="font-size:13px;color:#5c6370;margin:0 0 8px">If the button does not work, copy this link into your browser:</p>
        <p style="font-size:13px;word-break:break-all;margin:0 0 20px"><a href="${escape(link)}" style="color:#3b5bdb">${escape(link)}</a></p>
        <p style="font-size:13px;color:#5c6370;margin:0">${escape(footer)}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function activationMail(name: string, link: string): MailContent {
  const footer = 'The link expires in 24 hours.';
  return {
    subject: 'Confirm your BidHouse account',
    text: `Hi ${name},\n\nConfirm your email address by opening this link:\n${link}\n\n${footer}`,
    html: layout({ heading: `Hi ${name}, welcome to BidHouse`, intro: 'Confirm your email address to activate your account.', button: 'Activate my account', link, footer }),
  };
}

/**
 * mail-004: forgot-password and change-password mails are one template (same layout, wording pattern and
 * footer); only the words that name the action differ.
 */
const PASSWORD_LINK_WORDING = {
  reset: {
    subject: 'Reset your BidHouse password',
    heading: 'Reset your password',
    intro: (username: string) => `Someone asked to reset the password for ${username}.`,
    button: 'Set a new password',
    footer: "The link expires in 1 hour. Ignore this email if it wasn't you.",
  },
  change: {
    subject: 'Change your BidHouse password',
    heading: 'Change your password',
    intro: (username: string) => `Hi ${username}, you asked to change your password.`,
    button: 'Choose a new password',
    footer: "The link expires in 1 hour. Ignore this email if you didn't ask for it.",
  },
};

export function passwordLinkMail(kind: keyof typeof PASSWORD_LINK_WORDING, username: string, link: string): MailContent {
  const w = PASSWORD_LINK_WORDING[kind];
  const intro = w.intro(username);
  return {
    subject: w.subject,
    text: `${intro}

${w.button} here:
${link}

${w.footer}`,
    html: layout({ heading: w.heading, intro, button: w.button, link, footer: w.footer }),
  };
}

export const resetPasswordMail = (username: string, link: string) => passwordLinkMail('reset', username, link);
export const changePasswordMail = (username: string, link: string) => passwordLinkMail('change', username, link);
