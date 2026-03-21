import Stripe from 'stripe';

// Price per app per month in cents
export const APP_PRICE_CENTS = 1900; // $19/month

// Stripe is optional — the app runs without it, billing features just won't work
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
