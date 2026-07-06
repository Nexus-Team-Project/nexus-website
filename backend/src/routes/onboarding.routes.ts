/**
 * Exposes protected onboarding and business setup APIs for the dashboard.
 * Every route derives user and tenant context from authenticated backend state.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import {
  businessSetupPatchRequestSchema,
  businessSetupSubmitRequestSchema,
  skipWorkspaceRequestSchema,
  workspaceSetupRequestSchema,
} from '../schemas/onboarding.schemas';
import * as onboardingService from '../services/onboarding.service';
import { env } from '../config/env';

const router = Router();

router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = await onboardingService.getMe(req.user!.sub);
    res.json(me);
  } catch (err) {
    next(err);
  }
});

router.get('/onboarding/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await onboardingService.getOnboardingStatus(req.user!.sub);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/onboarding/workspace',
  authenticate,
  validate(workspaceSetupRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await onboardingService.createWorkspace(req.user!.sub, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/onboarding/skip',
  authenticate,
  validate(skipWorkspaceRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await onboardingService.skipWorkspaceSetup(req.user!.sub, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/business-setup', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await onboardingService.getBusinessSetup(req.user!.sub);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/business-setup',
  authenticate,
  validate(businessSetupPatchRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await onboardingService.saveBusinessSetupDraft(req.user!.sub, req.body.data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/business-setup',
  authenticate,
  validate(businessSetupSubmitRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await onboardingService.submitBusinessSetup(req.user!.sub, req.body.data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// DEV-ONLY: send a business-setup approval request without completing the full
// form (M8), so the global-upload / Go-Live gates can be exercised locally.
// HARD-DISABLED in production so it can never bypass real business setup.
router.post('/business-setup/dev-request', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (env.NODE_ENV === 'production') { res.status(404).json({ error: 'not_found' }); return; }
    await onboardingService.submitDevBusinessSetupRequest(req.user!.sub);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DEV-ONLY: dismiss the post-onboarding welcome popup so local testing can
// enter the dashboard. HARD-DISABLED in production - prod users leave the
// popup only via logout or the booking link.
router.post('/onboarding/welcome/dismiss', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (env.NODE_ENV === 'production') { res.status(404).json({ error: 'not_found' }); return; }
    await onboardingService.dismissPostOnboardingWelcome(req.user!.sub);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/onboarding/wizard-draft', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const draft = await onboardingService.loadWizardDraft(req.user!.sub);
    res.json({ draft });
  } catch (err) {
    next(err);
  }
});

router.patch('/onboarding/wizard-draft', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await onboardingService.saveWizardDraft(req.user!.sub, req.body);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/onboarding/wizard-draft', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await onboardingService.clearWizardDraft(req.user!.sub);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
