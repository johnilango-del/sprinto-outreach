import nodemailer from 'nodemailer';
import { env, activeSender } from './config.js';

// TEST MODE: every email goes to EMAIL_TEST_RECIPIENT, never to the contact.
// The contact's real name and address go into the subject line instead.
export async function sendTestEmail({ contactName, contactEmail, subject, text }) {
  const to = env('EMAIL_TEST_RECIPIENT');
  if (!to) throw new Error('EMAIL_TEST_RECIPIENT is not set in Vercel, so nothing can be sent.');
  const fullSubject = `[To: ${contactName || 'unknown'} <${contactEmail || 'no email'}>] ${subject}`;
  const sender = activeSender();

  if (sender.kind === 'gmail') {
    const user = env('GMAIL_USER');
    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass: env('GMAIL_APP_PASSWORD').replace(/\s+/g, '') },
    });
    try {
      await transport.sendMail({ from: `"Sprinto Growth" <${user}>`, to, subject: fullSubject, text });
    } catch (e) {
      const hint = /535|Username and Password not accepted|Invalid login/i.test(e?.message || '')
        ? ' Gmail refused the login: check GMAIL_USER and that GMAIL_APP_PASSWORD is a 16-character app password.'
        : '';
      throw new Error(`Gmail could not send: ${e?.message || e}.${hint}`);
    }
    return { sender: 'gmail', subject: fullSubject, to };
  }

  if (sender.kind === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Sprinto Growth <onboarding@resend.dev>', to: [to], subject: fullSubject, text }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const t = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`Resend could not send (HTTP ${res.status}): ${t}`);
    }
    return { sender: 'resend', subject: fullSubject, to };
  }

  throw new Error('No email sender is set up. Add GMAIL_USER and GMAIL_APP_PASSWORD (or RESEND_API_KEY) in Vercel.');
}
