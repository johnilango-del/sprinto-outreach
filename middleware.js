import { NextResponse } from 'next/server';
import { AUTH_COOKIE, tokenFor, safeEqual } from './lib/authToken.js';

// If DASHBOARD_PASSWORD is set, every page and API route asks for it. If empty, no password.
export async function middleware(req) {
  const pw = (process.env.DASHBOARD_PASSWORD || '').trim();
  if (!pw) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === '/login' || pathname === '/api/login') return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && safeEqual(cookie, await tokenFor(pw))) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Password required. Reload the page and sign in.' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
