<!-- SPDX-License-Identifier: MIT -->

# Rakomi Node quickstart

Ship a Rakomi-authenticated **Express** backend: OAuth 2.1 + PKCE sign-in, a **server-side
session** behind an httpOnly cookie, a validated `/api/me`, and sign-out — the copy-paste-run
starting point for a Node/Express app talking to Rakomi. `Dockerfile` + `fly.toml` are
ship-ready. It calls the real `@rakomi/node` SDK and the real Rakomi API; it does not
re-implement platform internals.

## What this demonstrates

1. **OAuth 2.1 authorization-code flow with PKCE** (RFC 7636 S256) — `generatePKCE()`,
   `generateState()`, `buildAuthorizeUrl()`, `exchangeCode()` from `@rakomi/node`, wired into
   two Express routes (`GET /login`, `GET /callback`).
2. **A genuine server-side session**: the httpOnly cookie carries ONLY an opaque, random session
   id — never the access or refresh token. Session data (the tokens) live in a server-side store,
   keyed by that id. A cookie leaked via XSS yields no bearer token by itself.
3. **A validated `/api/me`**: the access token is verified with `RakomiClient.verifyToken()` —
   the SDK's own verifier. Signature is checked against the issuer's JWKS, `iss`/`aud`/`exp` are
   checked, and the algorithm is pinned to RS256 (the SDK hardcodes this; it never reads `alg`
   from the token header). A missing session cookie, an expired token, a wrong-`aud` token, an
   `alg: none` token, and an HS256/384/512-signed token are all rejected with `401`.
4. **Sign-out**: a best-effort RFC 7009 `POST /oauth/revoke` (see `src/rakomi-revoke.ts`), then
   the local session and cookie are destroyed regardless of whether the revoke call succeeded —
   a network hiccup must never strand a visitor unable to sign out of *this* application.

## Run it

```sh
cp .env.example .env
# fill in RAKOMI_API_KEY, RAKOMI_CLIENT_ID, RAKOMI_CLIENT_SECRET, RAKOMI_REDIRECT_URI

npm install
npm run dev
# → http://localhost:3000

# production shape:
npm run build && node dist/server.js
```

The dependency resolves as `@rakomi/node@^0.2` on npm.

## Troubleshooting

If an OAuth error interrupts sign-in against a real tenant, note the approximate timestamp and
the error code from the callback — every OAuth error response is recorded server-side with its
error code and a request identifier, which support can use to locate the exact request when
diagnosing an integration issue.

## Deploy

**Docker:**

```sh
docker build -t rakomi-node-quickstart .
docker run --rm -p 3000:3000 --env-file .env rakomi-node-quickstart
```

`Dockerfile` is a 3-stage build (`deps` → `build` → `runtime`), runs as a non-root user (uid
1001), and never bakes a secret into any layer — every credential is supplied at `docker run`
time via `--env-file`/`-e` and read only from `process.env` at boot (`src/config.ts`).

**Fly.io:**

```sh
fly launch --no-deploy   # first time only, to register fly.toml
fly secrets set RAKOMI_API_KEY=... RAKOMI_CLIENT_ID=... RAKOMI_CLIENT_SECRET=...
fly deploy
```

`RAKOMI_REDIRECT_URI` is not a secret — set it in `fly.toml`'s `[env]` once you know your app's
`fly.dev` hostname, and register the same URI as a redirect URI for this OAuth client.

## Caveats

- **Not a UI framework demo** — the one HTML page (`GET /`) exists only so a human can click
  through the flow; there is no client-side JavaScript.
- **Not a multi-instance-ready session store** — the in-memory `SessionStore`
  (`src/session-store.ts`) is the simplest correct implementation for a single-process demo
  (every signed-in visitor is signed out on restart). A real deployment needs a shared store
  (Redis, a DB table): copy the two-method interface, not the `Map`.
- **Not CSRF-hardened beyond what the design gives you for free** — the OAuth `state` parameter
  protects `/callback` (checked, single-use); `SameSite=Lax` on the session cookie covers
  everything else. Add your own CSRF token for any additional state-changing endpoint you build.
- **Never put the access/refresh token in a client-readable cookie** — only an opaque session
  id, with a server-side lookup for everything else, and never a hand-rolled JWT decode —
  `/api/me` calls `RakomiClient.verifyToken()`, the SDK's own verifier, unchanged.
- `RAKOMI_API_KEY` / `RAKOMI_CLIENT_SECRET` are read once at boot from `process.env`
  (`src/config.ts`) and are never logged, sent to the browser, or baked into a Docker layer. This
  example handles OAuth/PKCE token exchange and session cookies — review changes to it with the
  same care as your own auth code.
- **Data & privacy**: the session cookie carries only an opaque, random session id — no personal
  data. The access/refresh tokens held server-side are session material, not stored beyond the
  process's lifetime (the in-memory store is empty on every restart); no request or response
  body is logged anywhere in this quickstart's own code.

## Standards this quickstart honors

RFC 6749 §4.1 (authorization code grant) + RFC 7636 (PKCE, S256) + RFC 9700 §2.4 (OAuth 2.1
security best practices, no client-secret-only public-client flows); RFC 7009 (token revocation
— `POST /oauth/revoke` always returns `200`, never an oracle for whether a token was ever valid);
RFC 6265 (HttpOnly / Secure off `localhost` / SameSite=Lax / Max-Age cookies); RFC 9068 (the
SDK's `typ: at+jwt` check on the verify path).
