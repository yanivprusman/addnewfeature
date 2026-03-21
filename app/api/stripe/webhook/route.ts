import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!stripe || !sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured or missing signature' }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const appSlug = session.metadata?.appSlug;
      if (appSlug) {
        await prisma.tenantApp.update({
          where: { appSlug },
          data: { status: 'running' },
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription as string;
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const appSlug = subscription.metadata?.appSlug;
        if (appSlug) {
          await prisma.tenantApp.update({
            where: { appSlug },
            data: { status: 'suspended' },
          });
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const appSlug = subscription.metadata?.appSlug;
      if (appSlug) {
        await prisma.tenantApp.update({
          where: { appSlug },
          data: { status: 'stopped' },
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
