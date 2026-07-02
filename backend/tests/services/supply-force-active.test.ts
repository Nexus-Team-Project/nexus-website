/**
 * Unit test for resolveCreateStatus (M7): the new-offer status decision.
 * Ecosystem = pending unless trusted OR forceActive (admin on-behalf implicitly
 * approves); non-ecosystem = active.
 */
import { describe, it, expect } from 'vitest';
import { resolveCreateStatus } from '../../src/services/supply-status.helper';

describe('resolveCreateStatus', () => {
  it('non-ecosystem is always active', () => {
    expect(resolveCreateStatus({ visibility: 'tenant_only', trusted: false, forceActive: false })).toBe('active');
    expect(resolveCreateStatus({ visibility: 'tenant_only', trusted: false, forceActive: true })).toBe('active');
  });
  it('ecosystem is pending unless trusted', () => {
    expect(resolveCreateStatus({ visibility: 'ecosystem', trusted: false, forceActive: false })).toBe('pending_approval');
    expect(resolveCreateStatus({ visibility: 'ecosystem', trusted: true, forceActive: false })).toBe('active');
  });
  it('forceActive makes ecosystem active regardless of trust', () => {
    expect(resolveCreateStatus({ visibility: 'ecosystem', trusted: false, forceActive: true })).toBe('active');
  });
});
