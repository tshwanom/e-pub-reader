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

  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: session.user.id, bookId },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(bookmarks);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { bookId, cfi, chapter, label } = await req.json();

  if (!bookId || !cfi) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const bookmark = await prisma.bookmark.create({
    data: {
      userId: session.user.id,
      bookId,
      cfi,
      chapter: chapter || null,
    },
  });

  return NextResponse.json({ ...bookmark, label: label || `Bookmark` });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Bookmark ID required' }, { status: 400 });
  }

  const bookmark = await prisma.bookmark.findUnique({ where: { id } });

  if (!bookmark || bookmark.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.bookmark.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
