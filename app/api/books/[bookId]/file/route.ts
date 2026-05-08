import { getBookAccessState } from "@/lib/book-access";
import { authOptions } from "@/lib/auth";
import { getBookUploadFilename, resolveStoredBookFilePath } from "@/lib/book-storage";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import fsPromises from "fs/promises";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
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
    const filename = getBookUploadFilename(book.epubFile.fileUrl).replace(/"/g, "");

    // Use stat for Content-Length and ETag without reading the entire file into RAM.
    const stat = await fsPromises.stat(filePath);
    const etag = `"${stat.size}-${stat.mtimeMs.toFixed(0)}"`;

    // Honour If-None-Match so the browser can skip re-downloading the same file.
    const ifNoneMatch = (req as any).headers?.get
      ? (req as Request).headers.get("if-none-match")
      : null;

    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304 });
    }

    // Stream the file directly to the client — no need to buffer the whole EPUB
    // in server memory before the first byte reaches the browser.
    const nodeStream = fs.createReadStream(filePath);
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) =>
          controller.enqueue(chunk instanceof Buffer ? chunk : Buffer.from(chunk))
        );
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return new NextResponse(webStream, {
      headers: {
        // Cache the EPUB privately for 1 hour. The ETag ensures the browser
        // re-validates if the file changes (e.g. after an admin re-upload).
        "Cache-Control": "private, max-age=3600, must-revalidate",
        "ETag": etag,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(stat.size),
        "Content-Type": book.epubFile.mimeType || "application/epub+zip",
      },
    });
  } catch (error) {
    console.error("File delivery error:", error);
    return NextResponse.json({ error: "Book file not found" }, { status: 404 });
  }
}