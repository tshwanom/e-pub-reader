import {
  type DonorTier,
  hasBookAccessForDonorTier,
  isDonorRestrictedBook,
  isRecurringDonorBook,
  resolveBookDonorAccessLevel,
} from '@/lib/book-access-config';
import { prisma } from "@/lib/prisma";

type SessionUserLike = {
  id?: string | null;
  role?: string | null;
  email?: string | null;
} | null | undefined;

type AccessControlledLike = {
  status: string;
  donorOnly?: boolean | null;
  donorAccessLevel?: string | null;
};

type BookAccessLike = AccessControlledLike;

type ViewerAccessLike = {
  donorTier: DonorTier;
  isPrivileged: boolean;
  isDonor: boolean;
  isRecurringDonor: boolean;
  isSignedIn?: boolean;
};

export function isPrivilegedUser(user?: SessionUserLike) {
  return user?.role === "ADMIN" || user?.role === "EDITOR";
}

function normalizeDonorEmail(email?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();
  return normalizedEmail || null;
}

function getDonationOwnershipMatches({
  userId,
  donorEmail,
}: {
  userId?: string | null;
  donorEmail?: string | null;
}) {
  return [
    ...(userId ? [{ userId }] : []),
    ...(donorEmail
      ? [{
          donorEmail: {
            equals: donorEmail,
            mode: 'insensitive' as const,
          },
        }]
      : []),
  ];
}

function resolveDonationOwner(userOrId?: string | SessionUserLike | null, email?: string | null) {
  return {
    userId: typeof userOrId === 'string' ? userOrId : userOrId?.id,
    donorEmail: normalizeDonorEmail(
      typeof userOrId === 'string' ? email : userOrId?.email
    ),
  };
}

async function linkCompletedDonationsToUser({
  userId,
  donorEmail,
}: {
  userId?: string | null;
  donorEmail?: string | null;
}) {
  if (!userId || !donorEmail) {
    return;
  }

  await prisma.donation.updateMany({
    where: {
      userId: null,
      status: 'COMPLETED',
      donorEmail: {
        equals: donorEmail,
        mode: 'insensitive' as const,
      },
    },
    data: {
      userId,
    },
  });
}

export async function isUserDonor(userOrId?: string | SessionUserLike | null, email?: string | null) {
  const donorProfile = await getUserDonorProfile(userOrId, email);

  return donorProfile.isDonor;
}

export async function getUserDonorProfile(
  userOrId?: string | SessionUserLike | null,
  email?: string | null
) {
  const { userId, donorEmail } = resolveDonationOwner(userOrId, email);

  if (!userId && !donorEmail) {
    return {
      tier: 'NONE' as DonorTier,
      isDonor: false,
      isRecurringDonor: false,
    };
  }

  if (userId && donorEmail) {
    await linkCompletedDonationsToUser({ userId, donorEmail });
  }

  const ownershipMatches = getDonationOwnershipMatches({ userId, donorEmail });

  const recurringDonation = await prisma.donation.findFirst({
    where: {
      status: 'COMPLETED',
      frequency: 'MONTHLY',
      OR: ownershipMatches,
    },
    select: {
      id: true,
    },
  });

  if (recurringDonation) {
    return {
      tier: 'RECURRING' as DonorTier,
      isDonor: true,
      isRecurringDonor: true,
    };
  }

  const donation = await prisma.donation.findFirst({
    where: {
      status: "COMPLETED",
      OR: ownershipMatches,
    },
    select: {
      id: true,
    },
  });

  return {
    tier: donation ? 'ONE_TIME' as DonorTier : 'NONE' as DonorTier,
    isDonor: Boolean(donation),
    isRecurringDonor: false,
  };
}

function resolveControlledAccessState(item: AccessControlledLike, viewer: ViewerAccessLike) {
  const donorAccessLevel = resolveBookDonorAccessLevel(item);
  const isPublished = item.status === "PUBLISHED";
  const meetsDonorRequirement = hasBookAccessForDonorTier(donorAccessLevel, viewer.donorTier);
  const hasAccess = viewer.isPrivileged || (isPublished && meetsDonorRequirement);

  return {
    hasAccess,
    isDonor: viewer.isPrivileged || viewer.isDonor,
    isRecurringDonor: viewer.isRecurringDonor,
    isPrivileged: viewer.isPrivileged,
    isPublished,
    donorTier: viewer.donorTier,
    donorAccessLevel,
    requiresDonation: isDonorRestrictedBook(donorAccessLevel),
    requiresRecurringDonation: isRecurringDonorBook(donorAccessLevel),
    isSignedIn: Boolean(viewer.isSignedIn),
  };
}

export async function getBookAccessState(book: BookAccessLike, user?: SessionUserLike) {
  const isPrivileged = isPrivilegedUser(user);
  const donorProfile = isPrivileged
    ? {
        tier: 'NONE' as DonorTier,
        isDonor: true,
        isRecurringDonor: false,
      }
    : await getUserDonorProfile(user);
  const accessState = resolveControlledAccessState(book, {
    donorTier: donorProfile.tier,
    isPrivileged,
    isDonor: donorProfile.isDonor,
    isRecurringDonor: donorProfile.isRecurringDonor,
    isSignedIn: Boolean(user?.id),
  });
  const { donorAccessLevel, ...bookAccessState } = accessState;

  return {
    ...bookAccessState,
    bookDonorAccessLevel: donorAccessLevel,
  };
}

export function getContentAccessStateForViewer(content: AccessControlledLike, viewer: ViewerAccessLike) {
  const accessState = resolveControlledAccessState(content, viewer);
  const { donorAccessLevel, ...contentAccessState } = accessState;

  return {
    ...contentAccessState,
    contentDonorAccessLevel: donorAccessLevel,
  };
}

export async function getContentAccessState(content: AccessControlledLike, user?: SessionUserLike) {
  const isPrivileged = isPrivilegedUser(user);
  const donorProfile = isPrivileged
    ? {
        tier: 'NONE' as DonorTier,
        isDonor: true,
        isRecurringDonor: false,
      }
    : await getUserDonorProfile(user);

  return getContentAccessStateForViewer(content, {
    donorTier: donorProfile.tier,
    isPrivileged,
    isDonor: donorProfile.isDonor,
    isRecurringDonor: donorProfile.isRecurringDonor,
    isSignedIn: Boolean(user?.id),
  });
}

export async function getDonorAccessState(user?: SessionUserLike) {
  const isPrivileged = isPrivilegedUser(user);
  const isSignedIn = Boolean(user?.id);
  const donorProfile = isPrivileged
    ? {
        tier: 'NONE' as DonorTier,
        isDonor: true,
        isRecurringDonor: false,
      }
    : await getUserDonorProfile(user);
  const hasAccess = isPrivileged || donorProfile.isDonor;

  return {
    hasAccess,
    isDonor: isPrivileged || donorProfile.isDonor,
    isRecurringDonor: donorProfile.isRecurringDonor,
    donorTier: donorProfile.tier,
    isPrivileged,
    isSignedIn,
    requiresDonation: !hasAccess,
  };
}

export async function getDonorFeatureAccessState(book: BookAccessLike, user?: SessionUserLike) {
  const bookAccess = await getBookAccessState(book, user);
  const isSignedIn = Boolean(user?.id);
  const hasAccess = bookAccess.hasAccess && (bookAccess.isPrivileged || bookAccess.isDonor);

  return {
    ...bookAccess,
    hasAccess,
    hasBookAccess: bookAccess.hasAccess,
    isSignedIn,
    requiresDonation: !hasAccess,
    requiresBookAccess: !bookAccess.hasAccess,
  };
}