import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIES = ['better-auth.session_token', '__Secure-better-auth.session_token'];

export function proxy(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const { pathname, search } = request.nextUrl;
  const signedIn = SESSION_COOKIES.some((c) => request.cookies.has(c));
  if (!signedIn && (pathname.startsWith('/w/') || pathname === '/onboarding')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set('x-request-id', requestId);
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set('x-request-id', requestId);
  return res;
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|relay-statusline.mjs).*)'],
};
