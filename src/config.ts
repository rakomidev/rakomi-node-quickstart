// SPDX-License-Identifier: MIT

/** Everything this quickstart needs, read once at boot from `process.env`. */
export interface AppConfig {
  /** Rakomi API base URL. Defaults to the production platform. Override for a local fake in tests. */
  apiBaseUrl: string;
  /** Server-side API key (`akm_live_…` / `akm_test_…` / `ca_live_…` / `ca_test_…`) — used only
   *  to construct the `RakomiClient` that verifies access tokens via JWKS. Never sent to the browser. */
  apiKey: string;
  /** OAuth client id issued for this application. */
  clientId: string;
  /** OAuth client secret (confidential client). Omit for a public client — PKCE alone is then
   *  the sole proof of possession, per RFC 9700 §2.4. */
  clientSecret: string | undefined;
  /** Exact redirect URI registered for this OAuth client, e.g. `http://localhost:3000/callback`. */
  redirectUri: string;
  /** Space-delimited OAuth scope string requested at `/login`. */
  scope: string;
  /** Name of the httpOnly session cookie. */
  sessionCookieName: string;
  /** Port the HTTP server listens on. */
  port: number;
  /** `true` when NODE_ENV !== 'production' — relaxes the session cookie's `Secure` flag so
   *  `http://localhost` works without TLS. Never set true in a real deployment. */
  isLocalDev: boolean;
}

const DEFAULT_API_BASE_URL = 'https://api.rakomi.com';
const DEFAULT_SESSION_COOKIE_NAME = 'rakomi_session';
const DEFAULT_SCOPE = 'openid profile email';
const DEFAULT_PORT = 3000;

/** A boot-time configuration failure — never a bare `Error` — always a typed `ConfigError`.
 *  Distinct from `@rakomi/node`'s own never-throws `VerifyResult` surface: THIS is a fail-fast
 *  boot check, not a request path. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in — see the README's "Run it" section.`,
    );
  }
  return value;
}

/**
 * Build an {@link AppConfig} from a process-environment-shaped object. Pure function (no direct
 * `process.env` read) so tests can pass a synthetic env pointed at a local fake server without
 * mutating the real process environment.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const apiKey = requireEnv(env, 'RAKOMI_API_KEY');
  const clientId = requireEnv(env, 'RAKOMI_CLIENT_ID');
  const redirectUri = requireEnv(env, 'RAKOMI_REDIRECT_URI');

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(redirectUri);
  } catch {
    throw new ConfigError(`RAKOMI_REDIRECT_URI is not a valid absolute URL: ${redirectUri}`);
  }
  const isLocalHost = redirectUrl.hostname === 'localhost' || redirectUrl.hostname === '127.0.0.1';
  if (redirectUrl.protocol !== 'https:' && !isLocalHost) {
    throw new ConfigError('RAKOMI_REDIRECT_URI must be an https: URL (localhost/127.0.0.1 may use http: for local dev).');
  }

  const portRaw = env['PORT'];
  const port = portRaw ? Number.parseInt(portRaw, 10) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new ConfigError(`PORT must be an integer in 1..65535, got: ${String(portRaw)}`);
  }

  return {
    apiBaseUrl: env['RAKOMI_API_BASE_URL']?.trim() || DEFAULT_API_BASE_URL,
    apiKey,
    clientId,
    clientSecret: env['RAKOMI_CLIENT_SECRET']?.trim() || undefined,
    redirectUri,
    scope: env['RAKOMI_SCOPE']?.trim() || DEFAULT_SCOPE,
    sessionCookieName: env['SESSION_COOKIE_NAME']?.trim() || DEFAULT_SESSION_COOKIE_NAME,
    port,
    isLocalDev: env['NODE_ENV'] !== 'production',
  };
}
