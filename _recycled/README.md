# Recycled Code

This folder contains files that were removed from the active codebase because they are no longer used.
Files are preserved here instead of being deleted, in case they are needed in the future.

## Recycled on 2026-03-09

### Components
| File | Reason | Replaced By |
|------|--------|-------------|
| `components/Dashboard.tsx` | Never imported anywhere | AdminDashboard.tsx / UserDashboard.tsx |
| `components/AnimatedLogo.tsx` | Never imported anywhere | NexusLogo.tsx |
| `components/PaymentCard.tsx` | Never imported anywhere | PaymentAnimation.tsx |
| `components/workspace/ScheduleStep.tsx` | Never imported anywhere | -- |
| `components/workspace/WelcomeModal.tsx` | Never imported anywhere | -- |

### Pages
| File | Reason | Replaced By |
|------|--------|-------------|
| `pages/VerifyEmail.tsx` | Never imported or routed | VerifyEmailPage.tsx |

### Utils
| File | Reason |
|------|--------|
| `utils/asset.ts` | Never imported anywhere |
| `utils/authFlowMock.ts` | Never imported anywhere |

### Assets
| File | Reason | Replaced By |
|------|--------|-------------|
| `assets/logos/mastercard-logo-old.png` | Old version | mastercard-logo.png |

### Images (original PNGs replaced by WebP)
Large PNG files replaced by WebP versions for performance. Originals kept here as backup.
