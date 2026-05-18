/**
 * Status-transition helpers for the supply layer.
 *
 * Extracted from supply.service to keep that file under the 350-line cap.
 * Owns the small spec rules around offer status changes:
 *   - 'disabled' / 'archived' must carry a non-empty statusReason.
 *   - statusReason is cleared when the offer leaves those states.
 *   - statusChangedAt is stamped on every real status transition.
 */

import {
  STATUS_TRANSITIONS_REQUIRING_REASON,
  type OfferStatus,
} from '../models/domain/supply.models';

/**
 * Throws when a status transition that requires a reason is missing one.
 * Used by updateOffer before any side effect (image upload, DB write).
 *
 * Input:
 *   nextStatus    - the requested status, or undefined when status is unchanged.
 *   statusReason  - the reason supplied by the caller (may be undefined).
 * Output: void on success.
 * Throws: Error with .status = 400 when the transition requires a reason and
 *         none was provided or the reason is empty/whitespace.
 */
export function assertStatusReasonProvided(
  nextStatus: OfferStatus | undefined,
  statusReason: string | undefined,
): void {
  if (nextStatus === undefined) return;
  const requiresReason =
    (STATUS_TRANSITIONS_REQUIRING_REASON as readonly string[]).includes(nextStatus);
  if (!requiresReason) return;
  if (statusReason && statusReason.trim()) return;
  throw Object.assign(
    new Error(`statusReason is required when transitioning to '${nextStatus}'`),
    { status: 400 },
  );
}

/**
 * Resolves the statusReason value to persist for a status transition.
 *
 * - When moving INTO a state that requires a reason: returns the supplied reason.
 * - When moving OUT of such a state into one that does not: returns null
 *   so the caller can clear the previous reason.
 * - Otherwise: returns the caller-supplied value when present, else undefined
 *   (which the caller's spread will simply skip).
 *
 * Input:
 *   nextStatus       - the requested status, or undefined.
 *   statusActuallyChanged - true when status is changing this update.
 *   suppliedReason   - the reason passed by the caller (may be undefined).
 * Output: the value to set, null to clear, or undefined to leave unchanged.
 */
export function resolveStatusReasonValue(
  nextStatus: OfferStatus | undefined,
  statusActuallyChanged: boolean,
  suppliedReason: string | undefined,
): string | null | undefined {
  if (suppliedReason !== undefined) return suppliedReason;
  if (!statusActuallyChanged || nextStatus === undefined) return undefined;
  const requiresReason =
    (STATUS_TRANSITIONS_REQUIRING_REASON as readonly string[]).includes(nextStatus);
  return requiresReason ? undefined : null;
}
