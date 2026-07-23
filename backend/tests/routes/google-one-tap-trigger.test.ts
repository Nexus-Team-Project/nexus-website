/**
 * Unit test for the One Tap lead trigger decision on the /api/auth/google
 * route: fires only for one_tap idToken logins that created a NEW user.
 */
import { describe, expect, it } from 'vitest';
import { shouldFireOneTapLead } from '../../src/routes/auth.routes';

describe('shouldFireOneTapLead', () => {
  it('fires for a new user via one_tap idToken', () => {
    expect(shouldFireOneTapLead({ source: 'one_tap', idToken: 'x' }, true)).toBe(true);
  });

  it('does not fire for returning users', () => {
    expect(shouldFireOneTapLead({ source: 'one_tap', idToken: 'x' }, false)).toBe(false);
  });

  it('does not fire without the one_tap source (normal google login)', () => {
    expect(shouldFireOneTapLead({ idToken: 'x' }, true)).toBe(false);
  });

  it('does not fire for non-idToken flows even if source is sent', () => {
    expect(shouldFireOneTapLead({ source: 'one_tap' }, true)).toBe(false);
  });
});
