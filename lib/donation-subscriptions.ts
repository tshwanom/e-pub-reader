import { prisma } from '@/lib/prisma';

type SessionUserLike = {
  id?: string | null;
  email?: string | null;
} | null | undefined;

export type ActivePaystackSubscriptionSnapshot = {
  id: string;
  donorEmail: string | null;
  gatewayAmount: number | null;
  gatewayCurrency: string | null;
  paystackSubscriptionCode: string;
  createdAt: Date;
  book: {
    id: string;
    title: string;
  } | null;
};

function normalizeDonorEmail(email?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();
  return normalizedEmail || null;
}

function buildSubscriptionOwnerWhereClause(user?: SessionUserLike) {
  const userId = user?.id?.trim() || null;
  const donorEmail = normalizeDonorEmail(user?.email);

  if (!userId && !donorEmail) {
    return null;
  }

  return {
    OR: [
      ...(userId ? [{ userId }] : []),
      ...(donorEmail
        ? [{ donorEmail: { equals: donorEmail, mode: 'insensitive' as const } }]
        : []),
    ],
  };
}

function toActivePaystackSubscriptionSnapshot(
  record: {
    id: string;
    donorEmail: string | null;
    gatewayAmount: { toString(): string } | null;
    gatewayCurrency: string | null;
    paystackSubscriptionCode: string | null;
    createdAt: Date;
    book: {
      id: string;
      title: string;
    } | null;
  } | null
): ActivePaystackSubscriptionSnapshot | null {
  if (!record?.paystackSubscriptionCode) {
    return null;
  }

  return {
    id: record.id,
    donorEmail: record.donorEmail,
    gatewayAmount: record.gatewayAmount ? Number(record.gatewayAmount) : null,
    gatewayCurrency: record.gatewayCurrency,
    paystackSubscriptionCode: record.paystackSubscriptionCode,
    createdAt: record.createdAt,
    book: record.book,
  };
}

export async function getUserActivePaystackSubscription(user?: SessionUserLike) {
  const ownerWhere = buildSubscriptionOwnerWhereClause(user);

  if (!ownerWhere) {
    return null;
  }

  const record = await prisma.donation.findFirst({
    where: {
      gateway: 'PAYSTACK',
      frequency: 'MONTHLY',
      status: 'COMPLETED',
      paystackSubscriptionCode: {
        not: null,
      },
      ...ownerWhere,
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
      donorEmail: true,
      gatewayAmount: true,
      gatewayCurrency: true,
      paystackSubscriptionCode: true,
      createdAt: true,
      book: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  return toActivePaystackSubscriptionSnapshot(record);
}

export async function getUserActivePaystackSubscriptionById({
  user,
  donationId,
}: {
  user?: SessionUserLike;
  donationId?: string | null;
}) {
  const normalizedDonationId = donationId?.trim() || null;

  if (!normalizedDonationId) {
    return getUserActivePaystackSubscription(user);
  }

  const ownerWhere = buildSubscriptionOwnerWhereClause(user);

  if (!ownerWhere) {
    return null;
  }

  const record = await prisma.donation.findFirst({
    where: {
      id: normalizedDonationId,
      gateway: 'PAYSTACK',
      frequency: 'MONTHLY',
      status: 'COMPLETED',
      paystackSubscriptionCode: {
        not: null,
      },
      ...ownerWhere,
    },
    select: {
      id: true,
      donorEmail: true,
      gatewayAmount: true,
      gatewayCurrency: true,
      paystackSubscriptionCode: true,
      createdAt: true,
      book: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  return toActivePaystackSubscriptionSnapshot(record);
}