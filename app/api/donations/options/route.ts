import { NextResponse } from 'next/server';
import { createDonationPresetOptions } from '@/lib/donation-quote';
import {
  isSupportedDonationCurrency,
  normalizeDonationCurrency,
} from '@/lib/donations';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const donorCurrency = normalizeDonationCurrency(requestUrl.searchParams.get('currency'));

  if (!isSupportedDonationCurrency(donorCurrency)) {
    return NextResponse.json(
      { error: `Unsupported donation currency: ${donorCurrency}` },
      { status: 400 }
    );
  }

  try {
    const options = await createDonationPresetOptions({ donorCurrency });

    return NextResponse.json({
      ...options,
      quotedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Donation preset options error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to build donation preset options',
      },
      { status: 500 }
    );
  }
}
