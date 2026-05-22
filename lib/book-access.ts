import { prisma } from "@/lib/prisma";

type SessionUserLike = {
  id?: string | null;
  role?: string | null;
  email?: string | null;
} | null | undefined;

type BookAccessLike = {
  status: string;
  donorOnly: boolean;
};

export function isPrivilegedUser(user?: SessionUserLike) {
  return user?.role === "ADMIN" || user?.role === "EDITOR";
}

function normalizeDonorEmail(email?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();
  return normalizedEmail || null;
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
  const userId = typeof userOrId === 'string' ? userOrId : userOrId?.id;
  const donorEmail = normalizeDonorEmail(
    typeof userOrId === 'string' ? email : userOrId?.email
  );

  if (!userId && !donorEmail) {
    return false;
  }

  if (userId && donorEmail) {
    await linkCompletedDonationsToUser({ userId, donorEmail });
  }

  const donation = await prisma.donation.findFirst({
    where: {
      status: "COMPLETED",
      OR: [
        ...(userId ? [{ userId }] : []),
        ...(donorEmail
          ? [{
              donorEmail: {
                equals: donorEmail,
                mode: 'insensitive' as const,
              },
            }]
          : []),
      ],
    },
    select: {
      id: true,
    },
  });

  return Boolean(donation);
}

export async function getBookAccessState(book: BookAccessLike, user?: SessionUserLike) {
  const isPrivileged = isPrivilegedUser(user);
  const isPublished = book.status === "PUBLISHED";
  const isDonor = isPrivileged ? true : await isUserDonor(user);
  const hasAccess = isPrivileged || (isPublished && (!book.donorOnly || isDonor));

  return {
    hasAccess,
    isDonor,
    isPrivileged,
    isPublished,
    requiresDonation: book.donorOnly,
  };
}

export async function getDonorAccessState(user?: SessionUserLike) {
  const isPrivileged = isPrivilegedUser(user);
  const isSignedIn = Boolean(user?.id);
  const isDonor = isPrivileged ? true : await isUserDonor(user);
  const hasAccess = isPrivileged || isDonor;

  return {
    hasAccess,
    isDonor,
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
    hasAccess,
    hasBookAccess: bookAccess.hasAccess,
    isDonor: bookAccess.isDonor,
    isPrivileged: bookAccess.isPrivileged,
    isPublished: bookAccess.isPublished,
    isSignedIn,
    requiresDonation: !hasAccess,
    requiresBookAccess: !bookAccess.hasAccess,
  };
}