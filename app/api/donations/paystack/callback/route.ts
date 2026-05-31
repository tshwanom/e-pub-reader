import { NextRequest, NextResponse } from 'next/server';
import {
  buildDonationDestination,
  getPaystackCustomerCode,
  getPaystackDonorEmail,
  getPaystackPlanCode,
  getPaystackSubscriptionCode,
  isSuccessfulPaystackVerification,
  toPaystackMinorUnits,
  verifyPaystackTransaction,
  processCompletedDonationAuth,
} from '@/lib/donation-payments';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const donationId = request.nextUrl.searchParams.get('donationId');
  const reference =
    request.nextUrl.searchParams.get('reference') ||
    request.nextUrl.searchParams.get('trxref');

  if (!donationId && !reference) {
    return NextResponse.redirect(buildDonationDestination(request, null, 'failed'));
  }

  const donation = await prisma.donation.findFirst({
    where: {
      OR: [
        ...(donationId ? [{ id: donationId }] : []),
        ...(reference ? [{ paystackReference: reference }] : []),
      ],
    },
    select: {
      id: true,
      bookId: true,
      status: true,
      gateway: true,
      frequency: true,
      gatewayAmount: true,
      gatewayCurrency: true,
      donorEmail: true,
      paystackReference: true,
      paystackPlanCode: true,
      paystackSubscriptionCode: true,
      paystackCustomerCode: true,
      userId: true,
    },
  });

  if (!donation || donation.gateway !== 'PAYSTACK') {
    return NextResponse.redirect(buildDonationDestination(request, null, 'failed'));
  }

  if (donation.status === 'COMPLETED') {
    return NextResponse.redirect(buildDonationDestination(request, donation.bookId, 'success'));
  }

  try {
    if (!reference) {
      return NextResponse.redirect(buildDonationDestination(request, donation.bookId, 'failed'));
    }

    const verification = await verifyPaystackTransaction(reference);

    const expectedAmountMinor = donation.gatewayAmount
      ? toPaystackMinorUnits(Number(donation.gatewayAmount))
      : 0;

    if (!donation.gatewayAmount || !donation.gatewayCurrency || !donation.paystackReference || !isSuccessfulPaystackVerification({
      verification,
      expectedAmountMinor,
      expectedCurrency: donation.gatewayCurrency,
      expectedReference: donation.paystackReference,
    })) {
      console.error('Paystack verification error:', verification);

      await prisma.donation.update({
        where: { id: donation.id },
        data: { status: 'FAILED' },
      });

      return NextResponse.redirect(buildDonationDestination(request, donation.bookId, 'failed'));
    }

    const finalDonorEmail = getPaystackDonorEmail(verification) ?? undefined;

    await prisma.donation.update({
      where: { id: donation.id },
      data: {
        status: 'COMPLETED',
        paystackReference: reference,
        donorEmail: finalDonorEmail,
        paystackPlanCode: getPaystackPlanCode(verification.data?.plan) ?? donation.paystackPlanCode ?? undefined,
        paystackSubscriptionCode: getPaystackSubscriptionCode(verification.data?.subscription) ?? donation.paystackSubscriptionCode ?? undefined,
        paystackCustomerCode: getPaystackCustomerCode(verification.data?.customer) ?? donation.paystackCustomerCode ?? undefined,
      },
    });

    let loginToken: string | null = null;
    if (finalDonorEmail) {
      const authResult = await processCompletedDonationAuth({
        donationId: donation.id,
        donorEmail: finalDonorEmail,
        originallyAuthenticated: Boolean(donation.userId),
      });
      loginToken = authResult.loginToken;
    }

    return NextResponse.redirect(
      buildDonationDestination(request, donation.bookId, 'success', loginToken, finalDonorEmail)
    );
  } catch (error) {
    console.error('Paystack callback error:', error);

    try {
      await prisma.donation.update({
        where: { id: donation.id },
        data: { status: 'FAILED' },
      });
    } catch (dbError) {
      console.error('Failed to mark donation as failed in DB:', dbError);
    }

    return NextResponse.redirect(buildDonationDestination(request, donation.bookId, 'failed'));
  }
}