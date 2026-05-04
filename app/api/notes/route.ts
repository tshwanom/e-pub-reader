import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get('bookId');
  if (!bookId) return NextResponse.json({ error: 'bookId is required' }, { status: 400 });

  const notes = await prisma.note.findMany({
    where: { userId: session.user.id, bookId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(notes);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { bookId, cfi, content } = body as { bookId?: string; cfi?: string; content?: string };

  if (!bookId || !cfi || !content?.trim()) {
    return NextResponse.json({ error: 'bookId, cfi and content are required' }, { status: 400 });
  }

  const note = await prisma.note.create({
    data: {
      userId: session.user.id,
      bookId,
      cfi,
      content: content.trim(),
    },
  });

  return NextResponse.json(note, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (note.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.note.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
