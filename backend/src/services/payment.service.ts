import { prisma } from '../config/database';
import { env } from '../config/env';
import { createError } from '../middleware/errorHandler';
import { ingest } from './analytics.service';

// ─── Types ──────────────────────────────────────────────────

export interface CreateOrderInput {
  userId?: string;
  guestEmail?: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number; // in smallest currency unit (agorot / cents)
  }>;
  shippingAddress?: Record<string, unknown>;
  currency?: string;
}

export interface OrderResult {
  orderId: string;
  clientSecret?: string; // Stripe PaymentIntent client_secret
  providerOrderId?: string;
  totalAmount: number;
}

// ─── Helpers ────────────────────────────────────────────────

function computeTotals(items: CreateOrderInput['items'], shippingAmount = 0, taxAmount = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return {
    subtotalAmount: subtotal,
    shippingAmount,
    taxAmount,
    totalAmount: subtotal + shippingAmount + taxAmount,
  };
}

// ─── Stripe provider ────────────────────────────────────────

async function createStripeOrder(input: CreateOrderInput): Promise<OrderResult> {
  if (!env.STRIPE_SECRET_KEY) {
    throw createError('Stripe secret key not configured', 500);
  }

  // Lazy-import stripe to avoid errors when not configured
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });

  const totals = computeTotals(input.items);
  const currency = (input.currency ?? 'ILS').toLowerCase();

  // Create PaymentIntent
  const intent = await stripe.paymentIntents.create({
    amount: totals.totalAmount,
    currency,
    metadata: {
      guestEmail: input.guestEmail ?? '',
      userId: input.userId ?? '',
    },
  });

  // Persist order
  const order = await prisma.order.create({
    data: {
      userId: input.userId,
      guestEmail: input.guestEmail,
      paymentMethod: 'CARD',
      ...totals,
      currency: currency.toUpperCase(),
      providerName: 'stripe',
      providerOrderId: intent.id,
      providerData: { clientSecret: intent.client_secret } as any,
      shippingAddress: (input.shippingAddress ?? null) as any,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.quantity * item.unitPrice,
        })),
      },
    },
  });

  return {
    orderId: order.id,
    clientSecret: intent.client_secret ?? undefined,
    providerOrderId: intent.id,
    totalAmount: totals.totalAmount,
  };
}

// ─── PayPlus provider (stub) ─────────────────────────────────

async function createPayPlusOrder(input: CreateOrderInput): Promise<OrderResult> {
  const totals = computeTotals(input.items);
  const currency = input.currency ?? 'ILS';

  // TODO: Implement PayPlus API when credentials are available
  // For now, create order in DB with PENDING status
  const order = await prisma.order.create({
    data: {
      userId: input.userId,
      guestEmail: input.guestEmail,
      paymentMethod: 'CARD',
      ...totals,
      currency,
      providerName: 'payplus',
      shippingAddress: (input.shippingAddress ?? null) as any,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.quantity * item.unitPrice,
        })),
      },
    },
  });

  return {
    orderId: order.id,
    totalAmount: totals.totalAmount,
  };
}

// ─── Public API ─────────────────────────────────────────────

export async function createOrder(input: CreateOrderInput): Promise<OrderResult> {
  if (env.ACTIVE_PAYMENT_PROVIDER === 'stripe') {
    return createStripeOrder(input);
  }
  return createPayPlusOrder(input);
}

export async function getOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, paymentEvents: true },
  });
}

export async function handleStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    throw createError('Stripe not configured', 500);
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });

  let event: import('stripe').Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    throw createError(`Webhook signature verification failed: ${err.message}`, 400);
  }

  // Persist event for audit trail
  const intent = event.data.object as any;
  const orderId = intent?.id
    ? (
        await prisma.order.findFirst({ where: { providerOrderId: intent.id } })
      )?.id
    : undefined;

  if (orderId) {
    await prisma.paymentEvent.create({
      data: {
        orderId,
        type: event.type,
        payload: event.data.object as any,
      },
    });
  }

  // Update order status + fire analytics events
  switch (event.type) {
    case 'payment_intent.succeeded': {
      if (orderId) {
        const order = await prisma.order.update({
          where: { id: orderId },
          data: { status: 'SUCCEEDED' },
        });
        void ingest({
          anonymousId: `server_${orderId}`,
          userId: order.userId ?? undefined,
          eventName: 'Payment_Completed',
          channel: 'PRODUCT',
          properties: {
            order_id: orderId,
            amount_cents: order.totalAmount,
            currency: order.currency,
            payment_method: 'card',
          },
          context: { source: 'stripe_webhook' },
        }).catch(console.error);
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      if (orderId) {
        const order = await prisma.order.update({
          where: { id: orderId },
          data: { status: 'FAILED' },
        });
        void ingest({
          anonymousId: `server_${orderId}`,
          userId: order.userId ?? undefined,
          eventName: 'Payment_Failed',
          channel: 'PRODUCT',
          properties: {
            order_id: orderId,
            amount_cents: order.totalAmount,
            currency: order.currency,
            error_code: intent.last_payment_error?.code ?? 'unknown',
            reason: intent.last_payment_error?.message ?? 'unknown',
          },
          context: { source: 'stripe_webhook' },
        }).catch(console.error);
      }
      break;
    }

    case 'charge.refunded': {
      if (orderId) {
        const order = await prisma.order.update({
          where: { id: orderId },
          data: { status: 'REFUNDED' },
        });
        void ingest({
          anonymousId: `server_${orderId}`,
          userId: order.userId ?? undefined,
          eventName: 'Payment_Refunded',
          channel: 'PRODUCT',
          properties: {
            order_id: orderId,
            amount_cents: order.totalAmount,
            currency: order.currency,
          },
          context: { source: 'stripe_webhook' },
        }).catch(console.error);
      }
      break;
    }
  }
}
