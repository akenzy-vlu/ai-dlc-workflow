import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';

import { loadAidlcConfig } from '../../config/aidlc.config';

/**
 * Who the controller will be told did this.
 *
 * `verified` is the whole point. `aidlc.py` writes `--by <name>` into an append-only trail
 * inside the repository, permanently — and until now that name came from a text box in
 * the browser, which means one person could record an approval under another person's
 * name. With one reader that is harmless; with a team it makes the trail decoration
 * rather than evidence.
 *
 * So: when the console sits behind something that authenticates (oauth2-proxy, an
 * ingress with OIDC, Tailscale, Cloudflare Access — all of which set a header), the
 * server takes the name from that header and *ignores* the body. Forging then requires
 * forging the header, which the proxy overwrites. When nothing is configured, the old
 * behaviour stands and the identity is marked unverified rather than silently trusted.
 */
export interface ActingIdentity {
  name: string;
  verified: boolean;
  source: 'trusted-header' | 'client';
}

export type IdentityMode =
  | { mode: 'trusted-header'; header: string }
  | { mode: 'client' };

export function identityMode(env: NodeJS.ProcessEnv = process.env): IdentityMode {
  const header = loadAidlcConfig(env).trustedUserHeader;
  return header ? { mode: 'trusted-header', header } : { mode: 'client' };
}

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

/**
 * Resolve the acting identity from one request.
 *
 * Exported separately from the decorator so it can be tested without a Nest context —
 * this is the function that decides whether an approval is attributable, and it should
 * be the easiest thing in the codebase to check.
 */
export function resolveActingIdentity(
  request: RequestLike,
  bodyField: string,
  env: NodeJS.ProcessEnv = process.env,
): ActingIdentity {
  const configured = identityMode(env);

  if (configured.mode === 'trusted-header') {
    const raw = request.headers[configured.header.toLowerCase()];
    const name = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!name) {
      // Failing closed matters more here than anywhere else in the console: falling back
      // to the body would mean a misconfigured proxy silently restores forgeable names.
      throw new BadRequestException(
        `refused: identity header ${configured.header} is missing — the console is configured to take ` +
          'the acting user from the authenticating proxy, and nothing else is trusted',
      );
    }
    return { name, verified: true, source: 'trusted-header' };
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const supplied = typeof body[bodyField] === 'string' ? (body[bodyField] as string).trim() : '';
  if (!supplied) {
    throw new BadRequestException(`\`${bodyField}\` is required — an approval is attributed to a person`);
  }
  return { name: supplied, verified: false, source: 'client' };
}

/**
 * `@Acting()` on a handler parameter, or `@Acting('launchedBy')` where the body field
 * that used to carry the name is not called `by`.
 */
export const Acting = createParamDecorator((bodyField: string | undefined, context: ExecutionContext) =>
  resolveActingIdentity(context.switchToHttp().getRequest<RequestLike>(), bodyField ?? 'by'),
);
