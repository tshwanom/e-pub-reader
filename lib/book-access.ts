import { prisma } from "@/lib/prisma";

type SessionUserLike = {
  id?: string | null;
  role?: string | null;
} | null | undefined;

type BookAccessLike = {
  status: string;
  donorOnly: boolean;
};

export function isPrivilegedUser(user?: SessionUserLike) {
  return user?.role === "ADMIN" || user?.role === "EDITOR";
}

export async function isUserDonor(userId?: string | null) {
  if (!userId) {
    return false;
  }

  const donation = await prisma.donation.findFirst({
    where: {
      userId,
      status: "COMPLETED",
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
  const isDonor = isPrivileged ? true : await isUserDonor(user?.id);
  const hasAccess = isPrivileged || (isPublished && (!book.donorOnly || isDonor));

  return {
    hasAccess,
    isDonor,
    isPrivileged,
    isPublished,
    requiresDonation: book.donorOnly,
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