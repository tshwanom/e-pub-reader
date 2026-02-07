import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

// Ensure upload directory exists
async function ensureUploadDir() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
}

export async function saveFile(file: File): Promise<{ url: string; filename: string }> {
  await ensureUploadDir();

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${uuidv4()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  await fs.writeFile(filepath, buffer);

  return {
    url: `/uploads/${filename}`,
    filename: filename,
  };
}

export async function deleteFile(filename: string): Promise<void> {
  const filepath = path.join(UPLOAD_DIR, filename);
  try {
    await fs.unlink(filepath);
  } catch (error) {
    console.error("Error deleting file:", error);
  }
}
