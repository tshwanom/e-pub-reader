import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { saveBookUpload } from '@/lib/book-storage';
import { slugifyBookTitle } from '@/lib/book-paths';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import { parseString } from 'xml2js';
import { promisify } from 'util';

const parseXml = promisify(parseString);

async function buildUniqueBookSlug(title: string) {
  const baseSlug = slugifyBookTitle(title);
  let candidate = baseSlug;
  let suffix = 2;

  while (await prisma.book.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

// Helper function to extract metadata from EPUB
async function extractEpubMetadata(buffer: Buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);

    // Find container.xml to locate the OPF file
    const containerXml = await zip.file('META-INF/container.xml')?.async('text');
    if (!containerXml) {
      throw new Error('Invalid EPUB: No container.xml found');
    }

    const containerData: any = await parseXml(containerXml);
    const opfPath = containerData.container.rootfiles[0].rootfile[0].$['full-path'];
    const opfDir = path.dirname(opfPath);

    // Read OPF file
    const opfXml = await zip.file(opfPath)?.async('text');
    if (!opfXml) {
      throw new Error('Invalid EPUB: OPF file not found');
    }

    const opfData: any = await parseXml(opfXml);
    const metadata = opfData.package.metadata[0];

    // Extract metadata fields
    const getMetadataValue = (field: any) => {
      if (!field || !field[0]) return null;
      return typeof field[0] === 'string' ? field[0] : field[0]._;
    };

    const title = getMetadataValue(metadata['dc:title']) || 'Untitled';
    const author = getMetadataValue(metadata['dc:creator']) || 'Unknown Author';
    const description = getMetadataValue(metadata['dc:description']) || '';
    const publisher = getMetadataValue(metadata['dc:publisher']);
    const language = getMetadataValue(metadata['dc:language']) || 'en';
    const isbn = getMetadataValue(metadata['dc:identifier']);
    const publishedDate = getMetadataValue(metadata['dc:date']);
    
    // Extract subjects/tags
    const subjects: string[] = [];
    if (metadata['dc:subject']) {
      metadata['dc:subject'].forEach((subject: any) => {
        const value = typeof subject === 'string' ? subject : subject._;
        if (value) subjects.push(value);
      });
    }

    // Extract cover image
    let coverImageId: string | null = null;
    let coverImagePath: string | null = null;

    // Method 1: Look for meta tag with name="cover"
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

    let coverBuffer: Buffer | null = null;
    let coverExt = '.jpg';

    if (coverImagePath) {
      const fullCoverPath = opfDir ? `${opfDir}/${coverImagePath}` : coverImagePath;
      const coverFile = zip.file(fullCoverPath);
      if (coverFile) {
        coverBuffer = await coverFile.async('nodebuffer');
        coverExt = path.extname(coverImagePath) || '.jpg';
      }
    }

    return {
      title,
      author,
      description,
      publisher,
      language,
      isbn,
      publishedDate,
      subjects,
      coverBuffer,
      coverExt,
    };
  } catch (error) {
    console.error('Error extracting EPUB metadata:', error);
    return null;
  }
}

export async function GET() {
  try {
    const books = await prisma.book.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      include: {
        epubFile: true,
      },
    });

    return NextResponse.json(books);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch books' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Read file buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Extract metadata from EPUB
    const metadata = await extractEpubMetadata(buffer);
    if (!metadata) {
      return NextResponse.json({ error: 'Failed to extract EPUB metadata' }, { status: 400 });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const uploadedBookFile = await saveBookUpload(filename, buffer);

    // Save cover if extracted
    let coverUrl = '/placeholder-cover.jpg';
    if (metadata.coverBuffer) {
      const coversDir = path.join(process.cwd(), 'public', 'covers');
      await mkdir(coversDir, { recursive: true });
      
      const coverFilename = `${timestamp}${metadata.coverExt}`;
      const coverPath = path.join(coversDir, coverFilename);
      await writeFile(coverPath, metadata.coverBuffer);
      coverUrl = `/covers/${coverFilename}`;
    }

    // Generate a clean unique slug from the title
    const slug = await buildUniqueBookSlug(metadata.title);

    // Create book record with extracted metadata
    const book = await prisma.book.create({
      data: {
        title: metadata.title,
        author: metadata.author,
        description: metadata.description,
        publisher: metadata.publisher,
        language: metadata.language || 'en',
        isbn: metadata.isbn,
        subjects: metadata.subjects,
        coverUrl,
        slug,
        status: 'DRAFT',
        publishedAt: metadata.publishedDate ? new Date(metadata.publishedDate) : null,
        epubFile: {
          create: {
            fileUrl: uploadedBookFile.fileUrl,
            fileSize: buffer.length,
            mimeType: 'application/epub+zip',
          },
        },
      },
      include: {
        epubFile: true,
      },
    });

    return NextResponse.json(book);
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload book', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
