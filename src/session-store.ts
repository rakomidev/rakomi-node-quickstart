// SPDX-License-Identifier: MIT

import { randomBytes } from 'node:crypto';

/** What a signed-in session carries. Never serialized to the client. */
export interface SessionRecord {
  accessToken: string;
  refreshToken: string | undefined;
  /** Epoch milliseconds after which this session's access token is known-expired. */
  expiresAt: number;
}

/** What one in-flight `/login` → `/callback` round trip carries, keyed by its own `state`. */
export interface PendingOAuth {
  codeVerifier: string;
  /** Epoch milliseconds after which an unconsumed `state` is rejected (bounds a stale/replayed
   *  authorize link — RFC 6749 §10.12 CSRF-state guidance says nothing about a TTL, this is a
   *  deliberate, documented addition). */
  expiresAt: number;
}

const SESSION_ID_BYTES = 32;
const PENDING_OAUTH_TTL_MS = 10 * 60 * 1000; // 10 minutes — generous for a human to complete a redirect.

export function generateSessionId(): string {
  return randomBytes(SESSION_ID_BYTES).toString('hex');
}

/** In-memory server-side session store. See the module doc comment for the shared-store caveat. */
export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  create(record: SessionRecord): string {
    const id = generateSessionId();
    this.sessions.set(id, record);
    return id;
  }

  get(id: string): SessionRecord | undefined {
    return this.sessions.get(id);
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  /** Test/ops seam — never called from a request handler. */
  get size(): number {
    return this.sessions.size;
  }
}

/** Short-lived store for the `state` ↔ PKCE `code_verifier` pairing between `/login` and `/callback`. */
export class PendingOAuthStore {
  private readonly pending = new Map<string, PendingOAuth>();

  set(state: string, codeVerifier: string): void {
    this.pending.set(state, { codeVerifier, expiresAt: Date.now() + PENDING_OAUTH_TTL_MS });
  }

  /** Single-use: a `state` is consumed (deleted) on lookup whether or not it is valid — a replayed
   *  or guessed `state` gets exactly one chance. Returns `undefined` for an absent OR expired entry. */
  consume(state: string): string | undefined {
    const entry = this.pending.get(state);
    this.pending.delete(state);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) return undefined;
    return entry.codeVerifier;
  }

  /** Test/ops seam — never called from a request handler. */
  get size(): number {
    return this.pending.size;
  }
}
