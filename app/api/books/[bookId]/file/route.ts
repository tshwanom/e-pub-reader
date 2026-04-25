import { getBookAccessState } from "@/lib/book-access";
import { authOptions } from "@/lib/auth";
import { getBookUploadFilename, resolveStoredBookFilePath } from "@/lib/book-storage";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await getServerSession(authOptions);
  const { bookId } = await params;

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: {
      epubFile: true,
    },
  });

  if (!book || !book.epubFile) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const access = await getBookAccessState(book, session?.user);

  if (!access.hasAccess) {
    return NextResponse.json(
      { error: access.requiresDonation ? "Donor access required" : "Book not found" },
      { status: access.isPublished ? 403 : 404 }
    );
  }

  try {
    const filePath = await resolveStoredBookFilePath(book.epubFile.fileUrl);
    const fileBuffer = await fs.readFile(filePath);
    const filename = getBookUploadFilename(book.epubFile.fileUrl).replace(/"/g, "");

    return new NextResponse(fileBuffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(fileBuffer.length),
        "Content-Type": book.epubFile.mimeType || "application/epub+zip",
      },
    });
  } catch (error) {
    console.error("File delivery error:", error);
    return NextResponse.json({ error: "Book file not found" }, { status: 404 });
  }
}