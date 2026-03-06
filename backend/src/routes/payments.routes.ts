import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import * as PaymentService from '../services/payment.service';
import { ingest } from '../services/analytics.service';

const router = Router();

// ─── POST /api/payments/orders ────────────────────────────
// Create order + get Stripe clientSecret

const createOrderSchema = z.object({
  body: z.object({
    guestEmail: z.string().email().optional(),
    currency: z.string().length(3).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          productName: z.string().min(1),
          quantity: z.number().int().positive(),
          unitPrice: z.number().int().positive(), // in agorot/cents
        }),
      )
      .min(1),
    shippingAddress: z.record(z.unknown()).optional(),
  }),
});

router.post(
  '/orders',
  optionalAuthenticate,
  apiLimiter,
  validate(createOrderSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.sub; // may be undefined for guest checkout
      const result = await PaymentService.createOrder({
        ...req.body,
        userId,
      });
      void ingest({
        anonymousId: (req.headers['x-anonymous-id'] as string | undefined) ?? `anon_order_${result.orderId}`,
        userId,
        eventName: 'Payment_Initiated',
        channel: 'PRODUCT',
        properties: {
          order_id: result.orderId,
          amount_cents: result.totalAmount,
          currency: req.body.currency ?? 'ILS',
          items_count: (req.body.items as unknown[]).length,
        },
        context: { ip: req.ip, userAgent: req.headers['user-agent'] ?? '' },
      }).catch(() => {});
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/payments/orders/:id ────────────────────────

router.get(
  '/orders/:id',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await PaymentService.getOrder(req.params.id);
      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      // Only return order to the owner or admin
      const isOwner = order.userId === req.user?.sub || order.guestEmail === req.body.email;
      const isAdmin = req.user?.role === 'ADMIN';
      if (!isOwner && !isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      res.json(order);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
