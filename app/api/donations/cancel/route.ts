import { NextRequest, NextResponse } from 'next/server';
import { buildDonationDestination } from '@/lib/donation-payments';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get('token');

  if (!orderId) {
    return NextResponse.redirect(buildDonationDestination(request, null, 'failed'));
  }

  const donation = await prisma.donation.findUnique({
    where: { paypalId: orderId },
    select: {
      id: true,
      bookId: true,
      status: true,
      gateway: true,
    },
  });

  if (!donation || donation.gateway !== 'PAYPAL') {
    return NextResponse.redirect(buildDonationDestination(request, null, 'failed'));
  }

  if (donation.status === 'PENDING') {
    await prisma.donation
      .update({
        where: { id: donation.id },
        data: { status: 'FAILED' },
      })
      .catch(() => undefined);
  }

  return NextResponse.redirect(buildDonationDestination(request, donation.bookId, 'failed'));
}