import {
  buildDonationDestination,
  capturePayPalOrder,
  getPayPalDonorEmail,
  isSuccessfulPayPalCapture,
  isPayPalSubscriptionId,
  getPayPalSubscription,
  isSuccessfulPayPalSubscription,
} from '@/lib/donation-payments';
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const donationId = request.nextUrl.searchParams.get('donationId');
  const requestedFrequency = request.nextUrl.searchParams.get('frequency');
  const paypalReference =
    request.nextUrl.searchParams.get('subscription_id')
    || request.nextUrl.searchParams.get('token')
    || request.nextUrl.searchParams.get('ba_token');

  if (!donationId && !paypalReference) {
    return NextResponse.redirect(buildDonationDestination(request, null, "failed"));
  }

  const donation = await prisma.donation.findFirst({
    where: {
      OR: [
        ...(donationId ? [{ id: donationId }] : []),
        ...(paypalReference ? [{ paypalId: paypalReference }] : []),
      ],
    },
    select: {
      id: true,
      bookId: true,
      status: true,
      gateway: true,
      frequency: true,
      amount: true,
      currency: true,
      paypalId: true,
    },
  });

  if (!donation || donation.gateway !== 'PAYPAL') {
    return NextResponse.redirect(buildDonationDestination(request, null, "failed"));
  }

  if (donation.status === "COMPLETED") {
    return NextResponse.redirect(buildDonationDestination(request, donation.bookId, "success"));
  }

  try {
    const isRecurringDonation = donation.frequency === 'MONTHLY'
      || requestedFrequency === 'MONTHLY'
      || request.nextUrl.searchParams.has('subscription_id')
      || isPayPalSubscriptionId(donation.paypalId);

    if (isRecurringDonation) {
      const subscriptionId = request.nextUrl.searchParams.get('subscription_id')
        || donation.paypalId
        || paypalReference;

      if (!subscriptionId) {
        return NextResponse.redirect(buildDonationDestination(request, donation.bookId, 'failed'));
      }

      const subscriptionData = await getPayPalSubscription(subscriptionId);

      if (!isSuccessfulPayPalSubscription({
        subscriptionData,
        expectedAmount: Number(donation.amount),
        expectedCurrency: donation.currency,
      })) {
        console.error('PayPal subscription verification error:', subscriptionData);

        await prisma.donation.update({
          where: { id: donation.id },
          data: { status: 'FAILED' },
        });

        return NextResponse.redirect(buildDonationDestination(request, donation.bookId, 'failed'));
      }

      await prisma.donation.update({
        where: { id: donation.id },
        data: {
          status: 'COMPLETED',
          paypalId: subscriptionId,
          donorEmail: getPayPalDonorEmail(subscriptionData) ?? undefined,
        },
      });
    } else {
      const orderId = donation.paypalId || paypalReference;

      if (!orderId) {
        return NextResponse.redirect(buildDonationDestination(request, donation.bookId, 'failed'));
      }

      const captureData = await capturePayPalOrder(orderId);

      if (!isSuccessfulPayPalCapture({
        captureData,
        expectedAmount: Number(donation.amount),
        expectedCurrency: donation.currency,
      })) {
        console.error("PayPal capture error:", captureData);

        await prisma.donation.update({
          where: { id: donation.id },
          data: { status: "FAILED" },
        });

        return NextResponse.redirect(buildDonationDestination(request, donation.bookId, "failed"));
      }

      await prisma.donation.update({
        where: { id: donation.id },
        data: {
          status: 'COMPLETED',
          paypalId: orderId,
          donorEmail: getPayPalDonorEmail(captureData) ?? undefined,
        },
      });
    }

    return NextResponse.redirect(buildDonationDestination(request, donation.bookId, "success"));
  } catch (error) {
    console.error("Donation capture error:", error);

    await prisma.donation
      .update({
        where: { id: donation.id },
        data: { status: "FAILED" },
      })
      .catch(() => undefined);

    return NextResponse.redirect(buildDonationDestination(request, donation.bookId, "failed"));
  }
}