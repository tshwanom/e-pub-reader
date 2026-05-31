import {
  buildDonationDestination,
  capturePayPalOrder,
  getPayPalDonorEmail,
  isSuccessfulPayPalCapture,
  isPayPalSubscriptionId,
  getPayPalSubscription,
  isSuccessfulPayPalSubscription,
  processCompletedDonationAuth,
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
      userId: true,
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

    let finalDonorEmail: string | undefined = undefined;

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

      finalDonorEmail = getPayPalDonorEmail(subscriptionData) ?? undefined;

      await prisma.donation.update({
        where: { id: donation.id },
        data: {
          status: 'COMPLETED',
          paypalId: subscriptionId,
          donorEmail: finalDonorEmail,
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

      finalDonorEmail = getPayPalDonorEmail(captureData) ?? undefined;

      await prisma.donation.update({
        where: { id: donation.id },
        data: {
          status: 'COMPLETED',
          paypalId: orderId,
          donorEmail: finalDonorEmail,
        },
      });
    }

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
      buildDonationDestination(request, donation.bookId, "success", loginToken, finalDonorEmail)
    );
  } catch (error) {
    console.error("Donation capture error:", error);

    try {
      await prisma.donation.update({
        where: { id: donation.id },
        data: { status: "FAILED" },
      });
    } catch (dbError) {
      console.error("Failed to mark donation as failed in DB:", dbError);
    }

    return NextResponse.redirect(buildDonationDestination(request, donation.bookId, "failed"));
  }
}