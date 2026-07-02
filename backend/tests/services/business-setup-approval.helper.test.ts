/**
 * Unit tests for the pure M8 business-setup approval helpers. No DB.
 */
import { describe, it, expect } from 'vitest';
import { nextApprovalOnSubmit, approvalAuthFields, isApproved } from '../../src/services/business-setup-approval.helper';

describe('business-setup-approval helper', () => {
  it('nextApprovalOnSubmit is a fresh pending approval', () => {
    const now = new Date('2026-07-02T00:00:00Z');
    expect(nextApprovalOnSubmit(now)).toEqual({ status: 'pending', submittedAt: now });
  });

  it('isApproved is true only for approved', () => {
    expect(isApproved({ status: 'approved' })).toBe(true);
    expect(isApproved({ status: 'pending' })).toBe(false);
    expect(isApproved({ status: 'denied' })).toBe(false);
    expect(isApproved(null)).toBe(false);
    expect(isApproved(undefined)).toBe(false);
  });

  it('approvalAuthFields maps each state', () => {
    expect(approvalAuthFields({ status: 'approved' })).toEqual({
      businessSetupApproved: true, businessSetupApprovalStatus: 'approved', businessSetupApprovalReason: null,
    });
    expect(approvalAuthFields({ status: 'denied', reason: 'bad docs' })).toEqual({
      businessSetupApproved: false, businessSetupApprovalStatus: 'denied', businessSetupApprovalReason: 'bad docs',
    });
    expect(approvalAuthFields({ status: 'pending' })).toEqual({
      businessSetupApproved: false, businessSetupApprovalStatus: 'pending', businessSetupApprovalReason: null,
    });
    expect(approvalAuthFields(null)).toEqual({
      businessSetupApproved: false, businessSetupApprovalStatus: null, businessSetupApprovalReason: null,
    });
  });
});
