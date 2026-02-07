import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { bookId, cfi, progress } = await req.json();

    if (!bookId || !cfi) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const updatedProgress = await prisma.readingProgress.upsert({
      where: {
        userId_bookId: {
          userId: session.user.id,
          bookId: bookId,
        },
      },
      update: {
        cfi: cfi,
        progress: progress || 0,
      },
      create: {
        userId: session.user.id,
        bookId: bookId,
        cfi: cfi,
        progress: progress || 0,
      },
    });

    return NextResponse.json(updatedProgress);
  } catch (error) {
    console.error("Progress save error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
