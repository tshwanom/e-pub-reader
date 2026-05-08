"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Sparkles, UploadCloud } from "lucide-react";

export default function UploadBookPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      // Upload file and create book record in one step
      const res = await fetch("/api/books", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Upload error details:", errorData);
        throw new Error(errorData.details || errorData.error || "Failed to upload book");
      }

      const book = await res.json();
      alert(`Book created: ${book.title}`);
      
      router.push("/admin/books");

    } catch (error) {
      console.error("Full error:", error);
      const errorMessage = error instanceof Error ? error.message : "Upload failed";
      alert(`Upload failed: ${errorMessage}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="surface-card p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
              New catalog entry
            </p>
            <h1 className="mt-2 font-playfair text-3xl text-landing-text sm:text-4xl">Upload a fresh EPUB</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-landing-text-muted sm:text-[15px]">
              We’ll extract core metadata, pull the cover if it exists, and prepare the title for donor access and Gemini narration generation.
            </p>
          </div>
          <span className="rounded-2xl bg-landing-accent/10 p-3 text-landing-accent">
            <Sparkles className="h-5 w-5" />
          </span>
        </div>
      </section>

      <form onSubmit={handleUpload} className="surface-card p-6 sm:p-8">
        <div className="rounded-[28px] border border-dashed border-landing-accent/30 bg-landing-accent/5 p-6 sm:p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <span className="rounded-2xl bg-white p-3 text-landing-accent shadow-sm ring-1 ring-white/65">
              <UploadCloud className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-landing-text">Choose an EPUB file</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-landing-text-muted">
              The upload flow creates a draft book automatically, extracts the cover, and stores the source EPUB for reading and narration generation.
            </p>

            <label className="mt-6 inline-flex cursor-pointer items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-landing-text shadow-sm ring-1 ring-landing-border transition-colors hover:border-landing-accent/40 hover:text-landing-accent">
              <input type="file" accept=".epub" onChange={handleFileChange} className="sr-only" />
              <FileText className="mr-2 h-4 w-4" />
              Browse EPUB
            </label>

            <p className="mt-4 text-sm text-landing-text-muted">
              {file ? `Selected: ${file.name}` : "No file selected yet"}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-landing-text-muted">
            Tip: keep filenames readable — the upload pipeline sanitizes them, but future you will still appreciate a tidy source file.
          </p>
          <button
            type="submit"
            disabled={!file || uploading}
            className="brand-button justify-center disabled:cursor-not-allowed disabled:bg-landing-accent/50"
          >
            {uploading ? "Uploading..." : "Create draft book"}
          </button>
        </div>
      </form>
    </div>
  );
}
