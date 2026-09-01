// SPDX-License-Identifier: MIT

// POST /oauth/revoke — RFC 7009 token revocation. `@rakomi/node` has no convenience wrapper for
// this endpoint yet, so this is a plain `fetch` call kept behind a clean function boundary, not
// a call inlined into the route handler. If the SDK later wraps `/oauth/revoke`, migrating is a
// one-file diff and every caller (and every test) keeps passing unchanged.

export interface RevokeOptions {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string | undefined;
}

/**
 * Revoke a refresh (or access) token per RFC 7009. The endpoint returns `200` on every outcome
 * — a nonexistent, already-revoked, or malformed token look identical to a successfully-revoked
 * one, by design (RFC 7009 §2.2: revocation must not leak whether a token was ever valid). This
 * function therefore reports only transport-level success/failure; it is NOT an oracle for
 * "was this token real" and must never be used as one.
 *
 * Never throws. Callers on the sign-out path should treat a `false` return as "best-effort
 * revoke did not complete" and clear the local session anyway — a revoke failure must never
 * strand a visitor unable to sign out of THIS application.
 */
export async function revokeToken(
  token: string,
  tokenTypeHint: 'refresh_token' | 'access_token',
  options: RevokeOptions,
): Promise<boolean> {
  const base = options.apiBaseUrl.replace(/\/+$/, '');
  const url = `${base}/oauth/revoke`;

  const body = new URLSearchParams({
    token,
    token_type_hint: tokenTypeHint,
    client_id: options.clientId,
  });
  if (options.clientSecret) {
    body.set('client_secret', options.clientSecret);
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}
