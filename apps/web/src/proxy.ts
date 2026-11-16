import { subdomainOf } from '@travelta/domain';
import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);

/**
 * Locale routing, plus host mapping for agency storefronts (M22): `<sub>.travelta.app` (and `<sub>.localhost` in the
 * prototype) serve the branded storefront at `/<locale>/s/_/…`, where the page resolves the store from the host.
 */
export default function proxy(req: NextRequest) {
  if (subdomainOf(req.headers.get('host') ?? '')) {
    const url = req.nextUrl.clone();
    const m = /^\/(en|ar)(\/.*)?$/.exec(url.pathname);
    if (!m) {
      url.pathname = `/${routing.defaultLocale}${url.pathname === '/' ? '' : url.pathname}`;
      return NextResponse.redirect(url);
    }
    const rest = m[2] ?? '';
    if (!rest.startsWith('/s/')) {
      url.pathname = `/${m[1]}/s/_${rest}`;
      return NextResponse.rewrite(url);
    }
  }
  return intl(req);
}

export const config = {
  // Every path except Next internals, API routes and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
