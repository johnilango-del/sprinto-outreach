// Reads environment variables on the server. Nothing here is ever sent to the browser.

export function env(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

export const GEMINI_MODEL = 'gemini-3.5-flash';
export const SIGN_OFF = 'John, Sprinto';

export function activeSender() {
  if (env('GMAIL_USER') && env('GMAIL_APP_PASSWORD')) {
    return { kind: 'gmail', label: `Gmail SMTP (${env('GMAIL_USER')})` };
  }
  if (env('RESEND_API_KEY')) {
    return { kind: 'resend', label: 'Resend (Sprinto Growth <onboarding@resend.dev>)' };
  }
  return { kind: 'none', label: 'No sender set up yet (add GMAIL_USER and GMAIL_APP_PASSWORD in Vercel)' };
}

export function missingEnv(names) {
  return names.filter((n) => !env(n));
}
