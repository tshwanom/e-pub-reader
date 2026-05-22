import { NextResponse } from 'next/server';
import { createDonationQuote } from '@/lib/donation-quote';
import {
  DEFAULT_DONATION_GATEWAY,
  isDonationGateway,
  isSupportedDonationCurrency,
  normalizeDonationCurrency,
} from '@/lib/donations';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const amount = Number(requestUrl.searchParams.get('amount'));
  const donorCurrency = normalizeDonationCurrency(requestUrl.searchParams.get('currency'));
  const requestedGateway = requestUrl.searchParams.get('gateway');
  const gateway = isDonationGateway(requestedGateway)
    ? requestedGateway
    : DEFAULT_DONATION_GATEWAY;

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  if (!isSupportedDonationCurrency(donorCurrency)) {
    return NextResponse.json(
      { error: `Unsupported donation currency: ${donorCurrency}` },
      { status: 400 }
    );
  }

  try {
    const quote = await createDonationQuote({
      amount,
      donorCurrency,
      gateway,
    });

    return NextResponse.json({
      ...quote,
      quotedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Donation quote error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate donation quote',
      },
      { status: 500 }
    );
  }
}