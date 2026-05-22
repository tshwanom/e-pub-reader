import { NextRequest, NextResponse } from 'next/server';
import { buildDonationDestination } from '@/lib/donation-payments';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const donationId = request.nextUrl.searchParams.get('donationId');
  const paypalReference =
    request.nextUrl.searchParams.get('subscription_id')
    || request.nextUrl.searchParams.get('token')
    || request.nextUrl.searchParams.get('ba_token');

  if (!donationId && !paypalReference) {
    return NextResponse.redirect(buildDonationDestination(request, null, 'failed'));
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
    },
  });

  if (!donation || donation.gateway !== 'PAYPAL') {
    return NextResponse.redirect(buildDonationDestination(request, null, 'failed'));
  }

  if (donation.status === 'PENDING') {
    await prisma.donation
      .update({
        where: { id: donation.id },
        data: {
          status: 'FAILED',
          ...(paypalReference ? { paypalId: paypalReference } : {}),
        },
      })
      .catch(() => undefined);
  }

  return NextResponse.redirect(buildDonationDestination(request, donation.bookId, 'failed'));
}