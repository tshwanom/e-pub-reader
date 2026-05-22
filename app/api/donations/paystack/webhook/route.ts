import type { DonationStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  getPaystackCustomerCode,
  getPaystackDonorEmail,
  getPaystackMetadataDonationId,
  getPaystackPlanCode,
  getPaystackSubscriptionCode,
  verifyPaystackWebhookSignature,
  type PaystackWebhookEvent,
} from '@/lib/donation-payments';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const RELEVANT_PAYSTACK_EVENT_TYPES = new Set([
  'charge.success',
  'subscription.create',
  'subscription.disable',
  'subscription.not_renew',
  'invoice.payment_failed',
  'invoice.update',
]);

const DONATION_SELECT = {
  id: true,
  status: true,
  donorEmail: true,
  paystackReference: true,
  paystackPlanCode: true,
  paystackSubscriptionCode: true,
  paystackCustomerCode: true,
} as const;

function getSubscriptionDetails(event: PaystackWebhookEvent) {
  const subscription = event.data?.subscription;

  if (!subscription || typeof subscription === 'string') {
    return null;
  }

  return subscription;
}

function mapPaystackSubscriptionStatus(status?: string | null): DonationStatus | null {
  switch (status?.trim().toLowerCase()) {
    case 'active':
    case 'non-renewing':
      return 'COMPLETED';
    case 'attention':
    case 'cancelled':
    case 'complete':
    case 'completed':
      return 'FAILED';
    default:
      return null;
  }
}

function mapPaystackInvoiceStatus(status?: string | null, paid?: boolean | number): DonationStatus | null {
  if (paid === true || paid === 1) {
    return 'COMPLETED';
  }

  switch (status?.trim().toLowerCase()) {
    case 'success':
    case 'paid':
    case 'completed':
      return 'COMPLETED';
    case 'failed':
    case 'attention':
    case 'cancelled':
    case 'expired':
    case 'abandoned':
      return 'FAILED';
    default:
      return null;
  }
}

function getDonationStatusForWebhookEvent(event: PaystackWebhookEvent): DonationStatus | null {
  switch (event.event) {
    case 'charge.success':
      return 'COMPLETED';
    case 'subscription.create':
      return mapPaystackSubscriptionStatus(event.data?.status) ?? 'COMPLETED';
    case 'subscription.not_renew':
      return 'COMPLETED';
    case 'subscription.disable':
    case 'invoice.payment_failed':
      return 'FAILED';
    case 'invoice.update':
      return mapPaystackInvoiceStatus(event.data?.status, event.data?.paid);
    default:
      return null;
  }
}

function getWebhookDonationLookup(event: PaystackWebhookEvent) {
  const subscription = getSubscriptionDetails(event);

  return {
    donationId: getPaystackMetadataDonationId(event.data?.metadata),
    reference: event.data?.reference?.trim() || null,
    subscriptionCode:
      event.data?.subscription_code?.trim()
      || getPaystackSubscriptionCode(event.data?.subscription)
      || null,
    planCode:
      getPaystackPlanCode(event.data?.plan)
      || getPaystackPlanCode(subscription?.plan)
      || null,
    customerCode:
      getPaystackCustomerCode(event.data?.customer)
      || event.data?.customer_code?.trim()
      || getPaystackCustomerCode(subscription?.customer)
      || null,
  };
}

async function findDonationForWebhook({
  donationId,
  reference,
  subscriptionCode,
  planCode,
  customerCode,
}: {
  donationId: string | null;
  reference: string | null;
  subscriptionCode: string | null;
  planCode: string | null;
  customerCode: string | null;
}) {
  const candidateWheres: Array<
    | { id: string }
    | { paystackSubscriptionCode: string }
    | { paystackReference: string }
    | { paystackPlanCode: string }
    | { paystackCustomerCode: string }
  > = [];

  if (donationId) {
    candidateWheres.push({ id: donationId });
  }

  if (subscriptionCode) {
    candidateWheres.push({ paystackSubscriptionCode: subscriptionCode });
  }

  if (reference) {
    candidateWheres.push({ paystackReference: reference });
  }

  if (planCode) {
    candidateWheres.push({ paystackPlanCode: planCode });
  }

  if (customerCode) {
    candidateWheres.push({ paystackCustomerCode: customerCode });
  }

  for (const candidateWhere of candidateWheres) {
    const donation = await prisma.donation.findFirst({
      where: {
        gateway: 'PAYSTACK',
        ...candidateWhere,
      },
      select: DONATION_SELECT,
    });

    if (donation) {
      return donation;
    }
  }

  return null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: PaystackWebhookEvent;

  try {
    event = JSON.parse(rawBody) as PaystackWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid Paystack webhook payload.' }, { status: 400 });
  }

  if (!RELEVANT_PAYSTACK_EVENT_TYPES.has(event.event || '')) {
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    const isVerified = verifyPaystackWebhookSignature({
      eventBody: rawBody,
      headers: request.headers,
    });

    if (!isVerified) {
      return NextResponse.json({ error: 'Invalid Paystack webhook signature.' }, { status: 401 });
    }
  } catch (error) {
    console.error('Paystack webhook verification failed:', error);
    return NextResponse.json({ error: 'Failed to verify Paystack webhook.' }, { status: 500 });
  }

  const { donationId, reference, subscriptionCode, planCode, customerCode } = getWebhookDonationLookup(event);

  if (!donationId && !reference && !subscriptionCode && !planCode && !customerCode) {
    return NextResponse.json({ received: true, ignored: true, reason: 'No donation reference found.' });
  }

  const donation = await findDonationForWebhook({
    donationId,
    reference,
    subscriptionCode,
    planCode,
    customerCode,
  });

  if (!donation) {
    return NextResponse.json({ received: true, ignored: true, reason: 'Donation not found.' });
  }

  const nextStatus = getDonationStatusForWebhookEvent(event);
  const donorEmail = getPaystackDonorEmail(event);
  const updateData: {
    status?: DonationStatus;
    donorEmail?: string;
    paystackReference?: string;
    paystackPlanCode?: string;
    paystackSubscriptionCode?: string;
    paystackCustomerCode?: string;
  } = {};

  if (nextStatus && donation.status !== nextStatus) {
    updateData.status = nextStatus;
  }

  if (reference && donation.paystackReference !== reference) {
    updateData.paystackReference = reference;
  }

  if (planCode && donation.paystackPlanCode !== planCode) {
    updateData.paystackPlanCode = planCode;
  }

  if (subscriptionCode && donation.paystackSubscriptionCode !== subscriptionCode) {
    updateData.paystackSubscriptionCode = subscriptionCode;
  }

  if (customerCode && donation.paystackCustomerCode !== customerCode) {
    updateData.paystackCustomerCode = customerCode;
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
    select: DONATION_SELECT,
  });

  return NextResponse.json({
    received: true,
    processed: true,
    donationId: updatedDonation.id,
    status: updatedDonation.status,
  });
}
