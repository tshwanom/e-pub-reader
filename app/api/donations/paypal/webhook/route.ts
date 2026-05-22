import type { DonationStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  getPayPalDonorEmail,
  isPayPalSubscriptionId,
  verifyPayPalWebhookSignature,
  type PayPalWebhookEvent,
} from '@/lib/donation-payments';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const RELEVANT_SUBSCRIPTION_EVENT_TYPES = new Set([
  'BILLING.SUBSCRIPTION.CREATED',
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.UPDATED',
  'BILLING.SUBSCRIPTION.RE-ACTIVATED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
  'PAYMENT.SALE.COMPLETED',
  'PAYMENT.SALE.REFUNDED',
  'PAYMENT.SALE.REVERSED',
]);

function mapPayPalSubscriptionResourceStatus(status?: string | null): DonationStatus | null {
  switch (status?.trim().toUpperCase()) {
    case 'ACTIVE':
      return 'COMPLETED';
    case 'APPROVAL_PENDING':
    case 'APPROVED':
    case 'CREATED':
      return 'PENDING';
    case 'SUSPENDED':
    case 'CANCELLED':
    case 'EXPIRED':
      return 'FAILED';
    default:
      return null;
  }
}

function getDonationStatusForWebhookEvent(event: PayPalWebhookEvent): DonationStatus | null {
  switch (event.event_type) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
    case 'BILLING.SUBSCRIPTION.RE-ACTIVATED':
    case 'PAYMENT.SALE.COMPLETED':
      return 'COMPLETED';
    case 'BILLING.SUBSCRIPTION.CANCELLED':
    case 'BILLING.SUBSCRIPTION.SUSPENDED':
    case 'BILLING.SUBSCRIPTION.EXPIRED':
    case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
    case 'PAYMENT.SALE.REVERSED':
      return 'FAILED';
    case 'PAYMENT.SALE.REFUNDED':
      return 'REFUNDED';
    case 'BILLING.SUBSCRIPTION.CREATED':
    case 'BILLING.SUBSCRIPTION.UPDATED':
      return mapPayPalSubscriptionResourceStatus(event.resource?.status);
    default:
      return mapPayPalSubscriptionResourceStatus(event.resource?.status);
  }
}

function getWebhookDonationLookup(event: PayPalWebhookEvent) {
  const donationId = event.resource?.custom_id?.trim() || null;
  const subscriptionReferenceCandidates = [
    event.resource?.id,
    event.resource?.billing_agreement_id,
  ];
  const paypalId = subscriptionReferenceCandidates.find((candidate) => isPayPalSubscriptionId(candidate))?.trim() || null;

  return {
    donationId,
    paypalId,
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: PayPalWebhookEvent;

  try {
    event = JSON.parse(rawBody) as PayPalWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid PayPal webhook payload.' }, { status: 400 });
  }

  if (!RELEVANT_SUBSCRIPTION_EVENT_TYPES.has(event.event_type || '')) {
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    const isVerified = await verifyPayPalWebhookSignature({
      eventBody: rawBody,
      headers: request.headers,
    });

    if (!isVerified) {
      return NextResponse.json({ error: 'Invalid PayPal webhook signature.' }, { status: 401 });
    }
  } catch (error) {
    console.error('PayPal webhook verification failed:', error);
    return NextResponse.json({ error: 'Failed to verify PayPal webhook.' }, { status: 500 });
  }

  const { donationId, paypalId } = getWebhookDonationLookup(event);

  if (!donationId && !paypalId) {
    return NextResponse.json({ received: true, ignored: true, reason: 'No donation reference found.' });
  }

  const donation = await prisma.donation.findFirst({
    where: {
      gateway: 'PAYPAL',
      OR: [
        ...(donationId ? [{ id: donationId }] : []),
        ...(paypalId ? [{ paypalId }] : []),
      ],
    },
    select: {
      id: true,
      status: true,
      paypalId: true,
      donorEmail: true,
    },
  });

  if (!donation) {
    return NextResponse.json({ received: true, ignored: true, reason: 'Donation not found.' });
  }

  const nextStatus = getDonationStatusForWebhookEvent(event);
  const donorEmail = getPayPalDonorEmail(event);
  const updateData: {
    status?: DonationStatus;
    paypalId?: string;
    donorEmail?: string;
  } = {};

  if (nextStatus && donation.status !== nextStatus) {
    updateData.status = nextStatus;
  }

  if (paypalId && donation.paypalId !== paypalId) {
    updateData.paypalId = paypalId;
  }

  if (donorEmail && donation.donorEmail !== donorEmail) {
    updateData.donorEmail = donorEmail;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({
      received: true,
      processed: true,
      donationId: donation.id,
      status: donation.status,
      unchanged: true,
    });
  }

  const updatedDonation = await prisma.donation.update({
    where: { id: donation.id },
    data: updateData,
    select: {
      id: true,
      status: true,
      paypalId: true,
      donorEmail: true,
    },
  });

  return NextResponse.json({
    received: true,
    processed: true,
    donationId: updatedDonation.id,
    status: updatedDonation.status,
  });
}
