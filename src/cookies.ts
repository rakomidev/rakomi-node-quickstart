// SPDX-License-Identifier: MIT

import { parseCookie, stringifySetCookie } from 'cookie';
import type { Request, Response } from 'express';

import type { AppConfig } from './config.js';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours — bounds how long a stale cookie lingers
// client-side; the SERVER session (and the underlying access/refresh token) can still expire
// or be revoked sooner. This is a demo default, not a platform-mandated session lifetime.

/**
 * Set the httpOnly session cookie carrying ONLY the opaque session id — never a token.
 * `secure` is dropped on localhost http:// (see {@link AppConfig.isLocalDev}); it is always set
 * over a real deployment's https://. `sameSite: 'lax'` is enough for a same-site cookie that is
 * never read on a cross-site top-level GET this app relies on for its own security (the OAuth
 * `state` param, not the cookie, carries CSRF protection for `/callback`).
 */
export function setSessionCookie(res: Response, config: AppConfig, sessionId: string): void {
  res.setHeader(
    'Set-Cookie',
    stringifySetCookie({
      name: config.sessionCookieName,
      value: sessionId,
      httpOnly: true,
      secure: !config.isLocalDev,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    }),
  );
}

/** Clear the session cookie on sign-out — `maxAge: 0` is the standard RFC 6265 deletion idiom. */
export function clearSessionCookie(res: Response, config: AppConfig): void {
  res.setHeader(
    'Set-Cookie',
    stringifySetCookie({
      name: config.sessionCookieName,
      value: '',
      httpOnly: true,
      secure: !config.isLocalDev,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    }),
  );
}

/** Read the session id from the request's `Cookie` header, or `undefined` if absent/malformed. */
export function readSessionId(req: Request, config: AppConfig): string | undefined {
  const header = req.headers.cookie;
  if (typeof header !== 'string') return undefined;
  const parsed = parseCookie(header);
  return parsed[config.sessionCookieName];
}
