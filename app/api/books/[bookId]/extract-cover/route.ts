import { NextRequest, NextResponse } from 'next/server';
import { resolveStoredBookFilePath } from '@/lib/book-storage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import path from 'path';
import fs from 'fs/promises';
import JSZip from 'jszip';
import { parseString } from 'xml2js';
import { promisify } from 'util';

const parseXml = promisify(parseString);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { bookId } = await params;

  try {
    // Get book with EPUB file
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      include: { epubFile: true },
    });

    if (!book || !book.epubFile) {
      return NextResponse.json({ error: 'Book or EPUB file not found' }, { status: 404 });
    }

    // Get local file path
    const filepath = await resolveStoredBookFilePath(book.epubFile.fileUrl);

    // Read EPUB file (it's a ZIP)
    const epubBuffer = await fs.readFile(filepath);
    const zip = await JSZip.loadAsync(epubBuffer);

    // Find container.xml to locate the OPF file
    const containerXml = await zip.file('META-INF/container.xml')?.async('text');
    if (!containerXml) {
      return NextResponse.json({ error: 'Invalid EPUB structure' }, { status: 400 });
    }

    const containerData: any = await parseXml(containerXml);
    const opfPath = containerData.container.rootfiles[0].rootfile[0].$['full-path'];
    const opfDir = path.dirname(opfPath);

    // Read OPF file
    const opfXml = await zip.file(opfPath)?.async('text');
    if (!opfXml) {
      return NextResponse.json({ error: 'OPF file not found' }, { status: 400 });
    }

    const opfData: any = await parseXml(opfXml);
    
    // Find cover image reference
    let coverImageId: string | null = null;
    let coverImagePath: string | null = null;

    // Method 1: Look for meta tag with name="cover"
    const metadata = opfData.package.metadata[0];
    if (metadata.meta) {
      const coverMeta = metadata.meta.find((m: any) => m.$.name === 'cover');
      if (coverMeta) {
        coverImageId = coverMeta.$.content;
      }
    }

    // Method 2: Look for item with properties="cover-image"
    const manifest = opfData.package.manifest[0];
    if (!coverImageId && manifest.item) {
      const coverItem = manifest.item.find((item: any) => 
        item.$.properties === 'cover-image' || item.$.id === 'cover' || item.$.id === 'cover-image'
      );
      if (coverItem) {
        coverImagePath = coverItem.$.href;
      }
    }

    // If we found an ID, get the path from manifest
    if (coverImageId && !coverImagePath) {
      const item = manifest.item.find((item: any) => item.$.id === coverImageId);
      if (item) {
        coverImagePath = item.$.href;
      }
    }

    if (!coverImagePath) {
      return NextResponse.json({ error: 'No cover image found in EPUB' }, { status: 404 });
    }

    // Construct full path to cover image within ZIP
    const fullCoverPath = opfDir ? `${opfDir}/${coverImagePath}` : coverImagePath;
    
    // Extract cover image
    const coverFile = zip.file(fullCoverPath);
    if (!coverFile) {
      return NextResponse.json({ error: 'Cover image file not found' }, { status: 404 });
    }

    const coverBuffer = await coverFile.async('nodebuffer');

    // Determine file extension
    const ext = path.extname(coverImagePath) || '.jpg';
    
    // Save cover to public/covers
    const coversDir = path.join(process.cwd(), 'public', 'covers');
    await fs.mkdir(coversDir, { recursive: true });
    
    const coverFilename = `${bookId}${ext}`;
    const coverPath = path.join(coversDir, coverFilename);
    await fs.writeFile(coverPath, coverBuffer);

    const publicCoverUrl = `/covers/${coverFilename}`;

    // Update book with cover URL
    await prisma.book.update({
      where: { id: bookId },
      data: { coverUrl: publicCoverUrl },
    });

    return NextResponse.json({ coverUrl: publicCoverUrl });
  } catch (error) {
    console.error('Cover extraction error:', error);
    return NextResponse.json(
      { error: 'Failed to extract cover', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
