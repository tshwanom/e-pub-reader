import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const { searchParams } = new URL(req.url);
  const includePrintLinks = searchParams.get('include')?.includes('printLinks');
  const includeSupplementary = searchParams.get('include')?.includes('supplementaryContents');

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: {
      printLinks: includePrintLinks,
      supplementaryContents: includeSupplementary,
    },
  });

  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  return NextResponse.json(book);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { bookId } = await params;
  const data = await req.json();

  try {
    // Handle print links and supplementary content separately
    const { printLinks, supplementaryContents, ...bookData } = data;

    // Update book
    await prisma.book.update({
      where: { id: bookId },
      data: {
        ...bookData,
      },
    });

    // Update print links if provided
    if (printLinks) {
      // Delete existing print links
      await prisma.printLink.deleteMany({
        where: { bookId },
      });

      // Create new print links
      if (printLinks.length > 0) {
        await prisma.printLink.createMany({
          data: printLinks
            .filter((link: any) => link.provider && link.url)
            .map((link: any) => ({
              bookId,
              provider: link.provider,
              url: link.url,
              format: link.format || 'PAPERBACK',
            })),
        });
      }
    }

    // Update supplementary content if provided
    if (supplementaryContents) {
      // Delete existing content
      await prisma.supplementaryContent.deleteMany({
        where: { bookId },
      });

      // Create new content
      if (supplementaryContents.length > 0) {
        await prisma.supplementaryContent.createMany({
          data: supplementaryContents.map((item: any, index: number) => ({
            bookId,
            type: item.type,
            title: item.title,
            content: item.content,
            url: item.url,
            author: item.author,
            order: index,
          })),
        });
      }
    }

    // Return updated book with relations
    const bookWithRelations = await prisma.book.findUnique({
      where: { id: bookId },
      include: { 
        printLinks: true,
        supplementaryContents: true 
      },
    });

    return NextResponse.json(bookWithRelations);
  } catch (error) {
    console.error('Book update error:', error);
    return NextResponse.json(
      { error: 'Failed to update book', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { bookId } = await params;

  try {
    // Prisma will cascade delete related records
    await prisma.book.delete({
      where: { id: bookId },
    });

    return NextResponse.json({ message: 'Book deleted' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete book' }, { status: 500 });
  }
}
