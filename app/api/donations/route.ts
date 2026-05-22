import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  createDonationQuote,
} from '@/lib/donation-quote';
import {
  buildPaystackReference,
  createPayPalOrder,
  initializePaystackTransaction,
  resolvePublicAppOrigin,
} from '@/lib/donation-payments';
import {
  DEFAULT_DONATION_GATEWAY,
  isDonationGateway,
  isSupportedDonationCurrency,
  normalizeDonationCurrency,
  DONATION_BASE_CURRENCY,
} from '@/lib/donations';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const body = await req.json();

  const bookId = typeof body.bookId === 'string' ? body.bookId : undefined;
  const amount = Number(body.amount);
  const gateway = isDonationGateway(body.gateway)
    ? body.gateway
    : DEFAULT_DONATION_GATEWAY;
  const donorCurrency = normalizeDonationCurrency(body.currency);
  const donorEmailFromBody = typeof body.donorEmail === 'string' ? body.donorEmail.trim() : '';

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  if (!isSupportedDonationCurrency(donorCurrency)) {
    return NextResponse.json(
      { error: `Unsupported donation currency: ${donorCurrency}` },
      { status: 400 }
    );
  }

  const book = bookId
    ? await prisma.book.findUnique({
        where: { id: bookId },
        select: {
          id: true,
          title: true,
          donorOnly: true,
          status: true,
        },
      })
    : null;

  if (bookId && !book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  if (book && book.status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Book not available for donations' }, { status: 400 });
  }

  if (book?.donorOnly && !session?.user?.id) {
    return NextResponse.json(
      { error: 'Please sign in before donating to unlock donor-only books.' },
      { status: 401 }
    );
  }

  try {
    const donorEmail = session?.user?.email?.trim() || donorEmailFromBody || null;
    const quote = await createDonationQuote({
      amount,
      donorCurrency,
      gateway,
    });
    const {
      donorAmount: roundedDonorAmount,
      baseAmount,
      gatewayAmount: quotedGatewayAmount,
      gatewayCurrency,
    } = quote;

    if (baseAmount < 1) {
      return NextResponse.json(
        { error: 'Minimum donation is the equivalent of USD 1.00.' },
        { status: 400 }
      );
    }

    const baseUrl = resolvePublicAppOrigin(req);
    const description = book ? `Support for “${book.title}”` : 'General donation';

    let gatewayAmount = quotedGatewayAmount;
    let paypalId: string | undefined;
    let paystackReference: string | undefined;
    let checkoutUrl: string;

    if (gateway === 'PAYPAL') {
      const order = await createPayPalOrder({
        amount: baseAmount,
        description,
        returnUrl: `${baseUrl}/api/donations/success`,
        cancelUrl: `${baseUrl}/api/donations/cancel`,
      });

      paypalId = order.orderId;
      checkoutUrl = order.approvalUrl;
    } else {
      if (!donorEmail) {
        return NextResponse.json(
          { error: 'Paystack needs an email address before checkout can begin.' },
          { status: 400 }
        );
      }

      const paystackTransaction = await initializePaystackTransaction({
        amount: gatewayAmount,
        email: donorEmail,
        reference: buildPaystackReference(),
        description,
        callbackUrl: `${baseUrl}/api/donations/paystack/callback`,
        metadata: {
          bookId: book?.id ?? null,
          donorAmount: roundedDonorAmount.toFixed(2),
          donorCurrency,
          baseAmount: baseAmount.toFixed(2),
          baseCurrency: DONATION_BASE_CURRENCY,
        },
      });

      paystackReference = paystackTransaction.reference;
      checkoutUrl = paystackTransaction.authorizationUrl;
    }

    await prisma.donation.create({
      data: {
        userId: session?.user?.id,
        donorEmail,
        bookId: book?.id,
        amount: baseAmount,
        currency: DONATION_BASE_CURRENCY,
        donorAmount: roundedDonorAmount,
        donorCurrency,
        gateway,
        gatewayAmount,
        gatewayCurrency,
        paypalId,
        paystackReference,
        status: 'PENDING',
      },
    });

    return NextResponse.json({
      checkoutUrl,
      gateway,
      baseAmount,
      baseCurrency: DONATION_BASE_CURRENCY,
      gatewayAmount,
      gatewayCurrency,
    });
  } catch (error) {
    console.error('Donation error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to process donation',
      },
      { status: 500 }
    );
  }
}
