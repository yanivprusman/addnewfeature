import { auth } from '@/lib/auth';
import { stripe, APP_PRICE_CENTS } from '@/lib/stripe';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { appSlug, appName } = await req.json();
  if (!appSlug) {
    return NextResponse.json({ error: 'appSlug is required' }, { status: 400 });
  }

  if (!stripe) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 });
  }

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3039';

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: session.user.email,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          recurring: { interval: 'month' },
          unit_amount: APP_PRICE_CENTS,
          product_data: {
            name: `App: ${appName || appSlug}`,
            description: `Monthly hosting for ${appSlug}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: session.user.id,
      appSlug,
    },
    success_url: `${baseUrl}/apps/${appSlug}?payment=success`,
    cancel_url: `${baseUrl}/apps?payment=cancelled`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
