import { AUTH_COOKIE, tokenFor, safeEqual } from '@/lib/authToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const pw = (process.env.DASHBOARD_PASSWORD || '').trim();
  if (!pw) return Response.json({ ok: true });
  const body = await req.json().catch(() => ({}));
  const given = String(body?.password || '');
  if (!safeEqual(await tokenFor(given), await tokenFor(pw))) {
    return Response.json({ error: 'Wrong password.' }, { status: 401 });
  }
  const token = await tokenFor(pw);
  const res = Response.json({ ok: true });
  res.headers.append(
    'Set-Cookie',
    `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  );
  return res;
}
