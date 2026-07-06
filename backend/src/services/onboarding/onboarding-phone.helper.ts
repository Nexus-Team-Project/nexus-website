/**
 * Pure classifier for the onboarding contact phone. Decides which
 * createWorkspace rule applies:
 *  - israeli:          valid Israeli mobile -> OTP verification required.
 *  - invalid_israeli:  Israeli-prefixed (+972/972/05...) but NOT a valid
 *                      mobile -> rejected outright (the UI blocks it too).
 *  - foreign:          any other number -> allowed without verification.
 *
 * Spec: docs/superpowers/specs/2026-07-06-onboarding-phone-otp-monday-popup-design.md
 */
import { normalizeIsraeliPhone } from '../../utils/israeliPhone';

export type OnboardingPhoneClass =
  | { kind: 'israeli'; normalized: string }
  | { kind: 'invalid_israeli' }
  | { kind: 'foreign' };

/**
 * Classify a raw contact phone string.
 * Input: user-supplied phone in any format.
 * Output: one of the three classes above.
 */
export function classifyOnboardingPhone(raw: string): OnboardingPhoneClass {
  const normalized = normalizeIsraeliPhone(raw);
  if (normalized) return { kind: 'israeli', normalized };
  const compact = String(raw ?? '').replace(/[^\d+]/g, '');
  if (compact.startsWith('+972') || compact.startsWith('972') || compact.startsWith('05')) {
    return { kind: 'invalid_israeli' };
  }
  return { kind: 'foreign' };
}
