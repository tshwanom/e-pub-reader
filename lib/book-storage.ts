import fs from "fs/promises";
import path from "path";

const PRIVATE_BOOK_UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");
const LEGACY_PUBLIC_BOOK_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureBookUploadDir() {
  if (!(await pathExists(PRIVATE_BOOK_UPLOAD_DIR))) {
    await fs.mkdir(PRIVATE_BOOK_UPLOAD_DIR, { recursive: true });
  }
}

export async function saveBookUpload(filename: string, buffer: Buffer) {
  await ensureBookUploadDir();

  const filePath = path.join(PRIVATE_BOOK_UPLOAD_DIR, filename);
  await fs.writeFile(filePath, buffer);

  return {
    filePath,
    fileUrl: `/uploads/${filename}`,
  };
}

export function getBookUploadFilename(fileUrl: string) {
  const filename = fileUrl.split("/").filter(Boolean).pop();

  if (!filename) {
    throw new Error("Book file URL is missing a filename");
  }

  return filename;
}

export async function resolveStoredBookFilePath(fileUrl: string) {
  const filename = getBookUploadFilename(fileUrl);
  const privatePath = path.join(PRIVATE_BOOK_UPLOAD_DIR, filename);

  if (await pathExists(privatePath)) {
    return privatePath;
  }

  const legacyPublicPath = path.join(LEGACY_PUBLIC_BOOK_UPLOAD_DIR, filename);
  if (await pathExists(legacyPublicPath)) {
    return legacyPublicPath;
  }

  throw new Error(`Stored book file not found for ${filename}`);
}