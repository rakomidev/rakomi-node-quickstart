// SPDX-License-Identifier: MIT

import express, { type Express, type Request, type Response } from 'express';

import type { RakomiClient } from '@rakomi/node';
import { buildAuthorizeUrl, exchangeCode, generatePKCE, generateState, resolveAuthorizationEndpoint } from '@rakomi/node';

import type { AppConfig } from './config.js';
import { clearSessionCookie, readSessionId, setSessionCookie } from './cookies.js';
import { toMeResponse } from './mappers.js';
import { revokeToken } from './rakomi-revoke.js';
import { PendingOAuthStore, SessionStore } from './session-store.js';

export interface AppDeps {
  config: AppConfig;
  client: RakomiClient;
  /** Injectable for tests — defaults to a fresh in-memory store per app instance. */
  sessionStore?: SessionStore;
  pendingOAuthStore?: PendingOAuthStore;
  /** Injectable seam for the OAuth helpers (buildAuthorizeUrl/generatePKCE/generateState/
   *  exchangeCode) — defaults to the real `@rakomi/node` exports. Tests never need this; it
   *  exists so the ONE production code path and the ONE tested code path are the same import. */
}

function renderStatusPage(signedIn: boolean): string {
  // A hand-rolled string, not a template engine — this quickstart's dependency budget is
  // deliberately Express + @rakomi/node + cookie, nothing more. No user-controlled data is
  // interpolated here (signedIn is a boolean this server computed), so there is no injection
  // surface despite the lack of an escaping helper.
  const body = signedIn
    ? `<p>Signed in. <a href="/api/me">GET /api/me</a> ·
       <form method="post" action="/logout" style="display:inline"><button type="submit">Sign out</button></form></p>`
    : `<p>Not signed in. <a href="/login">Sign in with Rakomi</a></p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Rakomi Node/Express quickstart</title></head><body><h1>Rakomi Node/Express quickstart</h1>${body}</body></html>`;
}

export function createApp(deps: AppDeps): Express {
  const { config, client } = deps;
  const sessionStore = deps.sessionStore ?? new SessionStore();
  const pendingOAuthStore = deps.pendingOAuthStore ?? new PendingOAuthStore();

  const app = express();
  app.disable('x-powered-by');

  app.get('/', (req: Request, res: Response) => {
    const sessionId = readSessionId(req, config);
    const signedIn = sessionId !== undefined && sessionStore.get(sessionId) !== undefined;
    res.type('html').send(renderStatusPage(signedIn));
  });

  app.get('/login', async (_req: Request, res: Response) => {
    // The hosted login UI does not always live on the API host `config.apiBaseUrl` routes to —
    // resolve the real `authorization_endpoint` via OIDC discovery (cached, with a host-naming
    // fallback) before redirecting. A bare `${apiBaseUrl}/oauth/authorize` redirect lands the
    // browser on a JSON API response, never a login form.
    const resolved = await resolveAuthorizationEndpoint(config.apiBaseUrl);
    if (!resolved.ok) {
      res.status(500).json({ error: resolved.error });
      return;
    }

    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = generateState();
    pendingOAuthStore.set(state, codeVerifier);

    const authorizeUrl = buildAuthorizeUrl({
      baseUrl: config.apiBaseUrl,
      authorizationEndpoint: resolved.data,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      codeChallenge,
      state,
      scope: config.scope,
    });
    res.redirect(authorizeUrl);
  });

  app.get('/callback', async (req: Request, res: Response) => {
    const { error, code, state } = req.query;

    if (typeof error === 'string') {
      res.status(400).json({
        error: { code: 'oauth/authorize_failed', message: `Authorization was not granted: ${error}` },
      });
      return;
    }

    if (typeof state !== 'string' || typeof code !== 'string') {
      res.status(400).json({
        error: { code: 'oauth/invalid_callback', message: 'Missing code or state query parameter.' },
      });
      return;
    }

    const codeVerifier = pendingOAuthStore.consume(state);
    if (codeVerifier === undefined) {
      res.status(400).json({
        error: {
          code: 'oauth/invalid_state',
          message: 'This sign-in link is stale, was already used, or does not match a request this server started.',
        },
      });
      return;
    }

    const result = await exchangeCode({
      baseUrl: config.apiBaseUrl,
      code,
      codeVerifier,
      redirectUri: config.redirectUri,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    if (!result.ok) {
      res.status(401).json({ error: { code: result.error.code, message: result.error.message } });
      return;
    }

    const sessionId = sessionStore.create({
      accessToken: result.data.access_token,
      refreshToken: result.data.refresh_token,
      expiresAt: Date.now() + result.data.expires_in * 1000,
    });
    setSessionCookie(res, config, sessionId);
    res.redirect('/');
  });

  app.get('/api/me', async (req: Request, res: Response) => {
    const sessionId = readSessionId(req, config);
    const session = sessionId !== undefined ? sessionStore.get(sessionId) : undefined;
    if (session === undefined) {
      res.status(401).json({ error: { code: 'session/missing', message: 'No active session.' } });
      return;
    }

    // The SDK's own verifier — signature via JWKS, iss/aud/exp checked, alg pinned to RS256.
    // Never hand-roll a JWT decode here.
    const result = await client.verifyToken(session.accessToken);
    if (!result.ok) {
      res.status(401).json({ error: { code: result.error.code, message: result.error.message } });
      return;
    }

    res.json(toMeResponse(result.data));
  });

  app.post('/logout', async (req: Request, res: Response) => {
    const sessionId = readSessionId(req, config);
    const session = sessionId !== undefined ? sessionStore.get(sessionId) : undefined;
    if (session !== undefined && sessionId !== undefined) {
      // Best-effort — RFC 7009 revoke never blocks local sign-out (see rakomi-revoke.ts doc
      // comment: a network failure here must never strand a visitor unable to sign out).
      const tokenToRevoke = session.refreshToken ?? session.accessToken;
      const tokenTypeHint = session.refreshToken ? 'refresh_token' : 'access_token';
      await revokeToken(tokenToRevoke, tokenTypeHint, {
        apiBaseUrl: config.apiBaseUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      });
      sessionStore.delete(sessionId);
    }
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  return app;
}
