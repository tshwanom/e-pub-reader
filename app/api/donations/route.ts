import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  isDonorRestrictedBook,
  isRecurringDonorBook,
  resolveBookDonorAccessLevel,
} from '@/lib/book-access-config';
import {
  createDonationQuote,
} from '@/lib/donation-quote';
import {
  buildPaystackReference,
  createPaystackPlan,
  createPayPalOrder,
  createPayPalSubscription,
  initializePaystackTransaction,
  resolvePublicAppOrigin,
} from '@/lib/donation-payments';
import {
  DEFAULT_DONATION_GATEWAY,
  DEFAULT_DONATION_FREQUENCY,
  isDonationFrequency,
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
  const frequency = isDonationFrequency(body.frequency)
    ? body.frequency
    : DEFAULT_DONATION_FREQUENCY;
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
          donorAccessLevel: true,
          status: true,
        },
      })
    : null;

  const bookDonorAccessLevel = resolveBookDonorAccessLevel(book);
  const requiresRecurringDonation = isRecurringDonorBook(bookDonorAccessLevel);
  const requiresDonation = isDonorRestrictedBook(bookDonorAccessLevel);

  if (bookId && !book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  if (book && book.status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Book not available for donations' }, { status: 400 });
  }

  if (requiresRecurringDonation && frequency !== 'MONTHLY') {
    return NextResponse.json(
      {
        error: 'This book is reserved for recurring donors. Please choose monthly support to unlock it.',
      },
      { status: 400 }
    );
  }

  if (requiresDonation && !session?.user?.id) {
    return NextResponse.json(
      {
        error: requiresRecurringDonation
          ? 'Please sign in before starting monthly support to unlock recurring-donor books.'
          : 'Please sign in before donating to unlock donor-only books.',
      },
      { status: 401 }
    );
  }

  let pendingDonationId: string | null = null;

  try {
    const donorEmail = (session?.user?.email?.trim() || donorEmailFromBody || '').toLowerCase() || null;
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

    if (gateway === 'PAYSTACK' && !donorEmail) {
      return NextResponse.json(
        { error: 'Paystack needs an email address before checkout can begin.' },
        { status: 400 }
      );
    }

    const baseUrl = resolvePublicAppOrigin(req);
    const description = book
      ? frequency === 'MONTHLY'
        ? `Monthly support for “${book.title}”`
        : `Support for “${book.title}”`
      : frequency === 'MONTHLY'
        ? 'Monthly donation'
        : 'General donation';

    const pendingDonation = await prisma.donation.create({
      data: {
        userId: session?.user?.id,
        donorEmail,
        bookId: book?.id,
        amount: baseAmount,
        currency: DONATION_BASE_CURRENCY,
        donorAmount: roundedDonorAmount,
        donorCurrency,
        gateway,
        frequency,
        gatewayAmount: quotedGatewayAmount,
        gatewayCurrency,
        status: 'PENDING',
      },
      select: {
        id: true,
      },
    });

    pendingDonationId = pendingDonation.id;

    const buildGatewayReturnUrl = (pathname: string) => {
      const url = new URL(pathname, baseUrl);
      url.searchParams.set('donationId', pendingDonation.id);
      url.searchParams.set('frequency', frequency);
      return url.toString();
    };

    let gatewayAmount = quotedGatewayAmount;
    let checkoutUrl: string;

    if (gateway === 'PAYPAL') {
      if (frequency === 'MONTHLY') {
        const subscription = await createPayPalSubscription({
          amount: baseAmount,
          description,
          returnUrl: buildGatewayReturnUrl('/api/donations/success'),
          cancelUrl: buildGatewayReturnUrl('/api/donations/cancel'),
          customId: pendingDonation.id,
          subscriberEmail: donorEmail ?? undefined,
        });

        await prisma.donation.update({
          where: { id: pendingDonation.id },
          data: {
            paypalId: subscription.subscriptionId,
          },
        });

        checkoutUrl = subscription.approvalUrl;
      } else {
        const order = await createPayPalOrder({
          amount: baseAmount,
          description,
          returnUrl: buildGatewayReturnUrl('/api/donations/success'),
          cancelUrl: buildGatewayReturnUrl('/api/donations/cancel'),
        });

        await prisma.donation.update({
          where: { id: pendingDonation.id },
          data: {
            paypalId: order.orderId,
          },
        });

        checkoutUrl = order.approvalUrl;
      }
    } else {
      const paystackPlan = frequency === 'MONTHLY'
        ? await createPaystackPlan({
            amount: gatewayAmount,
            name: book
              ? `One Man Revolution Monthly Support · ${book.title}`
              : 'One Man Revolution Monthly Support',
            description: book
              ? `Monthly support for “${book.title}” · Donation ${pendingDonation.id}`
              : `Monthly support · Donation ${pendingDonation.id}`,
          })
        : null;

      const paystackTransaction = await initializePaystackTransaction({
        amount: gatewayAmount,
        email: donorEmail,
        reference: buildPaystackReference(),
        description,
        callbackUrl: buildGatewayReturnUrl('/api/donations/paystack/callback'),
        planCode: paystackPlan?.planCode,
        metadata: {
          donationId: pendingDonation.id,
          bookId: book?.id ?? null,
          donorAmount: roundedDonorAmount.toFixed(2),
          donorCurrency,
          baseAmount: baseAmount.toFixed(2),
          baseCurrency: DONATION_BASE_CURRENCY,
          frequency,
          gateway,
          ...(paystackPlan?.planCode ? { paystackPlanCode: paystackPlan.planCode } : {}),
        },
      });

      await prisma.donation.update({
        where: { id: pendingDonation.id },
        data: {
          paystackReference: paystackTransaction.reference,
          ...(paystackPlan?.planCode ? { paystackPlanCode: paystackPlan.planCode } : {}),
        },
      });

      checkoutUrl = paystackTransaction.authorizationUrl;
    }

    return NextResponse.json({
      checkoutUrl,
      gateway,
      frequency,
      baseAmount,
      baseCurrency: DONATION_BASE_CURRENCY,
      gatewayAmount,
      gatewayCurrency,
    });
  } catch (error) {
    console.error('Donation error:', error);

    if (pendingDonationId) {
      await prisma.donation
        .update({
          where: { id: pendingDonationId },
          data: { status: 'FAILED' },
        })
        .catch(() => undefined);
    }

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
