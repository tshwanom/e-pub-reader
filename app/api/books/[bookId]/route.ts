import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { isPrivilegedUser } from '@/lib/book-access';
import { authOptions } from '@/lib/auth';
import { isBookDonorAccessLevel } from '@/lib/book-access-config';
import { CONTENT_FEATURE_UNAVAILABLE_MESSAGE, isContentFeatureUnavailableError } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import { deleteNarrationFolder } from '@/lib/narration-storage';

function createContentFeatureUnavailableResponse() {
  return NextResponse.json({ error: CONTENT_FEATURE_UNAVAILABLE_MESSAGE }, { status: 503 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { bookId } = await params;
    const { searchParams } = new URL(req.url);
    const includePrintLinks = searchParams.get('include')?.includes('printLinks');
    const includeSupplementary = searchParams.get('include')?.includes('supplementaryContents');

    const baseInclude: any = {};
    if (includePrintLinks) baseInclude.printLinks = true;

    let book: any;

    try {
      const include: any = { ...baseInclude };
      if (includeSupplementary) include.supplementaryContents = true;

      book = await prisma.book.findUnique({
        where: { id: bookId },
        ...(Object.keys(include).length > 0 ? { include } : {}),
      });
    } catch (error) {
      if (!includeSupplementary || !isContentFeatureUnavailableError(error)) {
        throw error;
      }

      console.warn(
        `[content-feature] supplementary contents are unavailable for book ${bookId}. Returning the book without supplementary content data.`,
        error
      );

      book = await prisma.book.findUnique({
        where: { id: bookId },
        ...(Object.keys(baseInclude).length > 0 ? { include: baseInclude } : {}),
      });

      if (book) {
        book = { ...book, supplementaryContents: [] };
      }
    }

    if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    if (book.status !== 'PUBLISHED' && !isPrivilegedUser(session?.user)) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    return NextResponse.json(book);
  } catch (error) {
    console.error('GET Book Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
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

    if ('donorAccessLevel' in bookData || 'donorOnly' in bookData) {
      const donorAccessLevel = isBookDonorAccessLevel(bookData.donorAccessLevel)
        ? bookData.donorAccessLevel
        : bookData.donorOnly
          ? 'ALL_DONORS'
          : 'PUBLIC';

      bookData.donorAccessLevel = donorAccessLevel;
      bookData.donorOnly = donorAccessLevel !== 'PUBLIC';
    }

    // Sanitize numeric fields that might come in as empty strings, null, or undefined
    if ('donationGoal' in bookData) {
      if (bookData.donationGoal === '' || bookData.donationGoal == null || isNaN(Number(bookData.donationGoal))) {
        bookData.donationGoal = null;
      } else {
        bookData.donationGoal = Number(bookData.donationGoal);
      }
    }

    if ('previewLimitValue' in bookData) {
      if (bookData.previewLimitValue === '' || bookData.previewLimitValue == null || isNaN(Number(bookData.previewLimitValue))) {
        bookData.previewLimitValue = 2;
      } else {
        bookData.previewLimitValue = Math.max(1, parseInt(String(bookData.previewLimitValue), 10));
      }
    }

    if ('previewLimitType' in bookData) {
      bookData.previewLimitType = bookData.previewLimitType === 'PERCENTAGE' ? 'PERCENTAGE' : 'CHAPTERS';
    }

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
    if (isContentFeatureUnavailableError(error)) {
      console.error('Book update error (content feature unavailable):', error);
      return createContentFeatureUnavailableResponse();
    }

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
    // 1. Get all supplementary contents associated with the book to clean up their narrations
    const supplementaryContents = await prisma.supplementaryContent.findMany({
      where: { bookId },
      select: { id: true },
    });

    // 2. Delete the book's own narration files from storage
    await deleteNarrationFolder(bookId);

    // 3. Delete narration files for each associated supplementary content
    for (const content of supplementaryContents) {
      await deleteNarrationFolder(`content/${content.id}`);
    }

    // 4. Delete supplementary contents from the database
    // (This will cascade delete ContentNarration and ContentComment in DB)
    await prisma.supplementaryContent.deleteMany({
      where: { bookId },
    });

    // 5. Prisma will cascade delete other related records (BookNarration, BookFile, etc.)
    await prisma.book.delete({
      where: { id: bookId },
    });

    return NextResponse.json({ message: 'Book deleted' });
  } catch (error) {
    console.error('Failed to delete book:', error);
    return NextResponse.json({ error: 'Failed to delete book' }, { status: 500 });
  }
}
