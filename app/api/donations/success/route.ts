import {
  buildDonationDestination,
  capturePayPalOrder,
  isSuccessfulPayPalCapture,
} from '@/lib/donation-payments';
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("token");

  if (!orderId) {
    return NextResponse.redirect(buildDonationDestination(request, null, "failed"));
  }

  const donation = await prisma.donation.findUnique({
    where: { paypalId: orderId },
    select: {
      id: true,
      bookId: true,
      status: true,
      gateway: true,
      amount: true,
      currency: true,
    },
  });

  if (!donation || donation.gateway !== 'PAYPAL') {
    return NextResponse.redirect(buildDonationDestination(request, null, "failed"));
  }

  if (donation.status === "COMPLETED") {
    return NextResponse.redirect(buildDonationDestination(request, donation.bookId, "success"));
  }

  try {
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
      data: { status: "COMPLETED" },
    });

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