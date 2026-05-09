import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const bookId = searchParams.get('bookId');

  if (!bookId) {
    return NextResponse.json({ error: 'Book ID required' }, { status: 400 });
  }

  const highlights = await prisma.highlight.findMany({
    where: {
      userId: session.user.id,
      bookId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return NextResponse.json(highlights);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookId, cfi, text, color, note } = await req.json();

    if (!bookId || !cfi || !text) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify book exists to prevent foreign key constraint errors (e.g. after DB seed)
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true }
    });

    if (!book) {
      return NextResponse.json({ error: 'Book not found. Please refresh the page.' }, { status: 404 });
    }

    const highlight = await prisma.highlight.create({
      data: {
        userId: session.user.id,
        bookId,
        cfi,
        text,
        color: color || 'yellow',
        note,
      },
    });

    return NextResponse.json(highlight);
  } catch (error) {
    console.error('[HIGHLIGHTS_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Highlight ID required' }, { status: 400 });
  }

  // Verify ownership
  const highlight = await prisma.highlight.findUnique({
    where: { id },
  });

  if (!highlight || highlight.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.highlight.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
