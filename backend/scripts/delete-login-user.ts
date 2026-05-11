/**
 * Purpose: Backward-compatible CLI wrapper for full Nexus user cleanup.
 *
 * Keep this file so existing commands can continue using
 * `npx tsx scripts/delete-login-user.ts --email=user@example.com`.
 */
import './delete-login-user/index';
