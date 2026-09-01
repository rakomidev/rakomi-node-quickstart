// SPDX-License-Identifier: MIT

// Never spread the raw verified JWT payload — `/api/me` returns a hand-picked field subset,
// not `result.data` verbatim. `TokenPayload` carries fields (`iss`, `aud`, `jti`, `token`, …)
// that are verification bookkeeping, not user-profile data a frontend should render.

import type { TokenPayload } from '@rakomi/node';

export interface MeResponse {
  userId: string;
  email: string | undefined;
  tenantId: string;
  sessionId: string | undefined;
  roles: string[];
  permissions: string[];
  mfaVerified: boolean;
}

export function toMeResponse(payload: TokenPayload): MeResponse {
  return {
    userId: payload.userId,
    email: payload.email,
    tenantId: payload.tenantId,
    sessionId: payload.sessionId,
    roles: payload.roles,
    permissions: payload.permissions,
    mfaVerified: payload.mfaVerified ?? false,
  };
}
