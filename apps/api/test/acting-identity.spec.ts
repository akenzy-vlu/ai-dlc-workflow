import { describe, expect, it } from 'vitest';

import { identityMode, resolveActingIdentity } from '../src/shared/identity/acting-identity';

const TRUSTED = { AIDLC_TRUSTED_USER_HEADER: 'X-Forwarded-User' } as NodeJS.ProcessEnv;
const LOCAL = {} as NodeJS.ProcessEnv;

/**
 * These guard the one property that makes an audit trail evidence rather than decoration:
 * behind a proxy, the name written into a repository cannot come from the request body.
 */
describe('acting identity', () => {
  it('takes the name from the trusted header and ignores the body entirely', () => {
    const identity = resolveActingIdentity(
      { headers: { 'x-forwarded-user': 'akenzy@example.com' }, body: { by: 'somebody-else' } },
      'by',
      TRUSTED,
    );
    expect(identity).toEqual({ name: 'akenzy@example.com', verified: true, source: 'trusted-header' });
  });

  it('fails closed when the header is configured but absent', () => {
    // A misconfigured proxy must not silently restore forgeable names.
    expect(() => resolveActingIdentity({ headers: {}, body: { by: 'akenzy' } }, 'by', TRUSTED)).toThrow(
      /identity header/i,
    );
  });

  it('falls back to the body when nothing authenticates, and says it is unverified', () => {
    const identity = resolveActingIdentity({ headers: {}, body: { by: '  Akenzy  ' } }, 'by', LOCAL);
    expect(identity).toEqual({ name: 'Akenzy', verified: false, source: 'client' });
  });

  it('still refuses an empty name in local mode', () => {
    expect(() => resolveActingIdentity({ headers: {}, body: { by: '   ' } }, 'by', LOCAL)).toThrow(/required/);
  });

  it('reads a differently-named body field for agent launches', () => {
    const identity = resolveActingIdentity({ headers: {}, body: { launchedBy: 'Akenzy' } }, 'launchedBy', LOCAL);
    expect(identity.name).toBe('Akenzy');
  });

  it('normalises the configured header name to lower case', () => {
    expect(identityMode(TRUSTED)).toEqual({ mode: 'trusted-header', header: 'x-forwarded-user' });
    expect(identityMode(LOCAL)).toEqual({ mode: 'client' });
  });
});
