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