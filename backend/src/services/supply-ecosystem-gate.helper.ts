/**
 * Whether the "ecosystem offers require completed business setup" gate is ENFORCED.
 * Enforced ONLY in production; relaxed in development/test so the global-upload flow
 * can be exercised locally without completing business setup.
 * DEV ONLY relax - this must return true in production.
 */
export function isEcosystemBusinessSetupGateEnforced(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production';
}
