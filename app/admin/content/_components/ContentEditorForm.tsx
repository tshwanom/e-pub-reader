"use client";

import { BOOK_DONOR_ACCESS_LEVEL_OPTIONS, type BookDonorAccessLevel } from "@/lib/book-access-config";
import type { OurFileRouter } from "@/app/api/uploadthing/core";
import { getHostedVideoProvider } from "@/lib/video-source";
import { UploadButton } from "@uploadthing/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ImageIcon, Save, Trash2, X } from "lucide-react";
import Link from "next/link";

type ContentType = "ARTICLE" | "VIDEO" | "POEM" | "QUOTE";
type ContentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

type BookOption = {
  id: string;
  title: string;
  slug: string;
};

type ContentFormState = {
  type: ContentType;
  status: ContentStatus;
  donorAccessLevel: BookDonorAccessLevel;
  title: string;
  slug: string;
  summary: string;
  content: string;
  url: string;
  author: string;
  coverUrl: string;
  bookId: string;
  narrationEnabled: boolean;
  order: number;
};

type InitialContent = {
  id?: string;
  type?: ContentType;
  status?: ContentStatus;
  donorAccessLevel?: BookDonorAccessLevel | null;
  title?: string | null;
  slug?: string | null;
  summary?: string | null;
  content?: string | null;
  url?: string | null;
  author?: string | null;
  coverUrl?: string | null;
  bookId?: string | null;
  narrationEnabled?: boolean | null;
  order?: number | null;
};

type ContentEditorFormProps = {
  mode: "create" | "edit";
  initialContent?: InitialContent | null;
  books: BookOption[];
};

const emptyContent: ContentFormState = {
  type: "ARTICLE",
  status: "DRAFT",
  donorAccessLevel: "PUBLIC",
  title: "",
  slug: "",
  summary: "",
  content: "",
  url: "",
  author: "",
  coverUrl: "",
  bookId: "",
  narrationEnabled: false,
  order: 0,
};

function toFormState(initialContent?: InitialContent | null): ContentFormState {
  if (!initialContent) {
    return emptyContent;
  }

  return {
    type: initialContent.type || "ARTICLE",
    status: initialContent.status || "DRAFT",
    donorAccessLevel: initialContent.donorAccessLevel || "PUBLIC",
    title: initialContent.title || "",
    slug: initialContent.slug || "",
    summary: initialContent.summary || "",
    content: initialContent.content || "",
    url: initialContent.url || "",
    author: initialContent.author || "",
    coverUrl: initialContent.coverUrl || "",
    bookId: initialContent.bookId || "",
    narrationEnabled: Boolean(initialContent.narrationEnabled),
    order: Number(initialContent.order || 0),
  };
}

function getTypeHint(type: ContentType) {
  switch (type) {
    case "VIDEO":
      return "Add an uploaded video file, direct stream URL, or hosted video URL plus an optional summary. Videos stay narration-free, and hosted embeds can still play inside the OMR watch page.";
    case "POEM":
      return "Use the body field for line-broken poetry. Narration can read the poem directly.";
    case "QUOTE":
      return "Use the body field for the quote and author for attribution.";
    case "ARTICLE":
    default:
      return "Use summary for cards and body for the full article/narration transcript.";
  }
}

function getContentAccessDescription(level: BookDonorAccessLevel) {
  switch (level) {
    case "ALL_DONORS":
      return "Any completed donation unlocks this content item across the site.";
    case "RECURRING_DONORS":
      return "Only readers with an active monthly donation can open this content item.";
    case "PUBLIC":
    default:
      return "Anyone can open this content item without donating.";
  }
}

export default function ContentEditorForm({ mode, initialContent, books }: ContentEditorFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<ContentFormState>(() => toFormState(initialContent));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = mode === "edit" && Boolean(initialContent?.id);
  const typeHint = useMemo(() => getTypeHint(form.type), [form.type]);
  const hasCoverPreview = Boolean(form.coverUrl.trim());
  const isVideoType = form.type === "VIDEO";
  const hasVideoSource = Boolean(form.url.trim());
  const hostedVideoProvider = useMemo(
    () => (isVideoType ? getHostedVideoProvider(form.url) : null),
    [isVideoType, form.url]
  );

  const updateField = <K extends keyof ContentFormState>(key: K, value: ContentFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    if (isVideoType && form.narrationEnabled) {
      setForm((current) => ({ ...current, narrationEnabled: false }));
    }
  }, [isVideoType, form.narrationEnabled]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(isEditMode ? `/api/admin/content/${initialContent!.id}` : "/api/admin/content", {
        method: isEditMode ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          bookId: form.bookId || null,
          slug: form.slug || null,
          summary: form.summary || null,
          content: form.content || null,
          url: form.url || null,
          author: form.author || null,
          coverUrl: form.coverUrl || null,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.details || payload.error || "Failed to save content.");
      }

      router.push(isEditMode ? `/admin/content/${payload.id}` : `/admin/content/${payload.id}`);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save content.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEditMode || !initialContent?.id) {
      return;
    }

    if (!confirm("Delete this content item? This also deletes its generated narration assets from the database record.")) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/content/${initialContent.id}`, { method: "DELETE" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete content.");
      }

      router.push("/admin/content");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete content.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? (
        <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </div>
      ) : null}

      <section className="surface-card p-6 sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">Content details</p>
              <h2 className="mt-2 text-xl font-semibold text-landing-text">Publish platform-wide content</h2>
              <p className="mt-2 text-sm leading-6 text-landing-text-muted">
                Articles, videos, poems, and quotes can stand alone or be connected to a book. Articles, poems, and quotes can expose donor narration after generation. Videos use the watch-page player only and always stay narration-free.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-landing-text-muted">
                <span className="mb-2 block font-medium text-landing-text">Content type</span>
                <select
                  value={form.type}
                  onChange={(event) => updateField("type", event.target.value as ContentType)}
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                >
                  <option value="ARTICLE">Article / Blog</option>
                  <option value="VIDEO">Video</option>
                  <option value="POEM">Poem</option>
                  <option value="QUOTE">Quote</option>
                </select>
              </label>

              <label className="block text-sm text-landing-text-muted">
                <span className="mb-2 block font-medium text-landing-text">Status</span>
                <select
                  value={form.status}
                  onChange={(event) => updateField("status", event.target.value as ContentStatus)}
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-landing-text">Title</label>
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                required
                className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-landing-text">Slug</label>
              <input
                value={form.slug}
                onChange={(event) => updateField("slug", event.target.value)}
                placeholder="Auto-generated from the title if blank"
                className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-landing-text">Summary</label>
              <textarea
                value={form.summary}
                onChange={(event) => updateField("summary", event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm leading-6 text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-landing-text">Body / transcript</label>
              <textarea
                value={form.content}
                onChange={(event) => updateField("content", event.target.value)}
                rows={12}
                placeholder={typeHint}
                className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm leading-6 text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
              />
            </div>
          </div>

          <aside className="space-y-5">
            <div className="surface-muted p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">Workflow</p>
              <h3 className="mt-2 text-lg font-semibold text-landing-text">Production controls</h3>
              <p className="mt-2 text-sm leading-6 text-landing-text-muted">
                Draft first, publish when approved, then generate donor narration for written content from the editor. Later text edits automatically trigger a fresh sync pass so old audio does not linger on the donor player like an accidental director's cut.
              </p>
            </div>

            <div className="surface-muted p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">Audience</p>
              <h3 className="mt-2 text-lg font-semibold text-landing-text">Who can open this content?</h3>
              <div className="mt-4 grid gap-3">
                {BOOK_DONOR_ACCESS_LEVEL_OPTIONS.map((option) => {
                  const checked = form.donorAccessLevel === option.id;

                  return (
                    <label
                      key={option.id}
                      className={`rounded-2xl border p-4 transition-all duration-200 ${
                        checked
                          ? "border-landing-accent bg-white shadow-sm ring-2 ring-landing-accent/15"
                          : "border-white/65 bg-white/70 hover:border-landing-accent/35"
                      }`}
                    >
                      <input
                        type="radio"
                        name="contentDonorAccessLevel"
                        value={option.id}
                        checked={checked}
                        onChange={(event) => updateField("donorAccessLevel", event.target.value as BookDonorAccessLevel)}
                        className="sr-only"
                      />

                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={`mt-1 h-3 w-3 rounded-full transition-colors ${
                            checked ? "bg-landing-accent" : "bg-landing-border"
                          }`}
                        />
                        <div>
                          <span className="block text-sm font-semibold text-landing-text">{option.label}</span>
                          <p className="mt-2 text-sm leading-6 text-landing-text-muted">
                            {getContentAccessDescription(option.id)}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <label className="block text-sm text-landing-text-muted">
              <span className="mb-2 block font-medium text-landing-text">Related book (optional)</span>
              <select
                value={form.bookId}
                onChange={(event) => updateField("bookId", event.target.value)}
                className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
              >
                <option value="">Standalone platform content</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>{book.title}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-landing-text-muted">
              <span className="mb-2 block font-medium text-landing-text">Author / attribution</span>
              <input
                value={form.author}
                onChange={(event) => updateField("author", event.target.value)}
                className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
              />
            </label>

            {isVideoType ? (
              <div className="space-y-3 text-sm text-landing-text-muted">
                <div>
                  <span className="mb-2 block font-medium text-landing-text">Video source</span>
                  <p className="text-xs leading-5 text-landing-text-muted">
                    Upload a direct video file for the cleanest in-library player, or paste a hosted URL from YouTube, Vimeo, or another platform. We keep playback on the OMR watch page, but provider-hosted embeds may still show limited in-frame branding or links we cannot fully suppress.
                  </p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-landing-border bg-white shadow-sm">
                  <div className="border-b border-landing-border/70 px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-landing-text">Upload video</p>
                        <p className="mt-1 text-xs leading-5 text-landing-text-muted">Accepted: direct video files up to 512 MB. For YouTube, Vimeo, HLS, or another hosted source, paste the URL below instead.</p>
                      </div>

                      {hasVideoSource ? (
                        <button
                          type="button"
                          onClick={() => updateField("url", "")}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
                        >
                          <X className="h-4 w-4" />
                          Clear source
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-4">
                      <UploadButton<OurFileRouter, "videoUploader">
                        endpoint="videoUploader"
                        onClientUploadComplete={(files) => {
                          const uploadedUrl = files?.[0]?.serverData?.url ?? files?.[0]?.ufsUrl;

                          if (!uploadedUrl) {
                            setError("Upload completed, but no video URL was returned.");
                            return;
                          }

                          updateField("url", uploadedUrl);
                          setError(null);
                        }}
                        onUploadError={(uploadError: Error) => {
                          setError(uploadError.message || "Failed to upload the video.");
                        }}
                        appearance={{
                          container: "w-full items-stretch",
                          button: "w-full rounded-xl bg-landing-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-landing-accent-secondary ut-uploading:cursor-not-allowed ut-uploading:bg-landing-accent/70",
                          allowedContent: "mt-2 text-xs text-landing-text-muted",
                        }}
                      />
                    </div>
                  </div>

                  <div className="p-4">
                    <label className="block text-sm text-landing-text-muted">
                      <span className="mb-2 block font-medium text-landing-text">Video / stream URL</span>
                      <input
                        value={form.url}
                        onChange={(event) => updateField("url", event.target.value)}
                        placeholder="Upload above or paste a YouTube / Vimeo / .mp4 / .m3u8 URL"
                        className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                      />
                    </label>

                    {hostedVideoProvider ? (
                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm leading-6 text-amber-800 ring-1 ring-amber-100">
                        This source is hosted on {hostedVideoProvider === "youtube" ? "YouTube" : "Vimeo"}. It can stay embedded on the OMR watch page, but the provider may still show limited branding or in-frame links that we cannot fully remove.
                      </div>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm leading-6 text-emerald-800 ring-1 ring-emerald-100">
                        Best for the cleanest OMR-only playback: uploaded files, CDN file URLs, and direct stream URLs keep the experience most tightly inside the site.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <label className="block text-sm text-landing-text-muted">
                <span className="mb-2 block font-medium text-landing-text">External URL</span>
                <input
                  value={form.url}
                  onChange={(event) => updateField("url", event.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                />
              </label>
            )}

            <div className="space-y-3 text-sm text-landing-text-muted">
              <div>
                <span className="mb-2 block font-medium text-landing-text">Cover / thumbnail</span>
                <p className="text-xs leading-5 text-landing-text-muted">
                  Paste an existing image URL or upload a new file directly for articles, videos, poems, and quote artwork.
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-landing-border bg-white shadow-sm">
                <div className="relative aspect-[16/10] w-full bg-landing-surface-muted">
                  {hasCoverPreview ? (
                    <img
                      src={form.coverUrl}
                      alt={form.title ? `${form.title} cover preview` : "Content cover preview"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-landing-text-muted">
                      <ImageIcon className="h-8 w-8" />
                      <p className="text-sm">No cover uploaded yet</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-landing-border/70 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-landing-text">Upload image</p>
                      <p className="mt-1 text-xs leading-5 text-landing-text-muted">Accepted: JPG, PNG, GIF, or WEBP up to 4 MB.</p>
                    </div>

                    {hasCoverPreview ? (
                      <button
                        type="button"
                        onClick={() => updateField("coverUrl", "")}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
                      >
                        <X className="h-4 w-4" />
                        Clear image
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <UploadButton<OurFileRouter, "coverImageUploader">
                      endpoint="coverImageUploader"
                      onClientUploadComplete={(files) => {
                        const uploadedUrl = files?.[0]?.serverData?.url ?? files?.[0]?.ufsUrl;

                        if (!uploadedUrl) {
                          setError("Upload completed, but no cover URL was returned.");
                          return;
                        }

                        updateField("coverUrl", uploadedUrl);
                        setError(null);
                      }}
                      onUploadError={(uploadError: Error) => {
                        setError(uploadError.message || "Failed to upload the cover image.");
                      }}
                      appearance={{
                        container: "w-full items-stretch",
                        button: "w-full rounded-xl bg-landing-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-landing-accent-secondary ut-uploading:cursor-not-allowed ut-uploading:bg-landing-accent/70",
                        allowedContent: "mt-2 text-xs text-landing-text-muted",
                      }}
                    />
                  </div>
                </div>
              </div>

              <label className="block text-sm text-landing-text-muted">
                <span className="mb-2 block font-medium text-landing-text">Cover / thumbnail URL</span>
                <input
                  value={form.coverUrl}
                  onChange={(event) => updateField("coverUrl", event.target.value)}
                  placeholder="https://... or upload above"
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                />
              </label>
            </div>

            <label className="block text-sm text-landing-text-muted">
              <span className="mb-2 block font-medium text-landing-text">Sort order</span>
              <input
                type="number"
                value={form.order}
                onChange={(event) => updateField("order", Number(event.target.value))}
                className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
              />
            </label>

            {isVideoType ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900 ring-1 ring-amber-100">
                <p className="font-semibold text-amber-950">Video narration is disabled</p>
                <p className="mt-2 leading-6 text-amber-800">
                  Videos use the in-library player only. Save an uploaded file, direct stream URL, or hosted video URL here, and we will keep donor narration switched off automatically for this content type.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-white/65">
                <div className="flex items-start gap-3">
                  <input
                    id="narrationEnabled"
                    type="checkbox"
                    checked={form.narrationEnabled}
                    onChange={(event) => updateField("narrationEnabled", event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-landing-border text-landing-accent focus:ring-landing-accent"
                  />
                  <div>
                    <label htmlFor="narrationEnabled" className="block text-sm font-semibold text-landing-text">
                      Enable donor narration player
                    </label>
                    <p className="mt-2 text-sm leading-6 text-landing-text-muted">
                      Generate audio below first, then keep this on when the article, poem, or quote should expose donor narration. Non-donors will stay locked out, and if the script changes later, older audio stays hidden until the fresh sync finishes.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>

      <div className="surface-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-landing-text">Save content changes</p>
          <p className="mt-1 text-sm text-landing-text-muted">
            Publishing state, donor access, platform placement, and narration visibility are saved together. Transcript edits also mark existing narration for automatic re-sync.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/admin/content" className="ghost-button gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to content
          </Link>
          {isEditMode ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-100 px-5 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? "Deleting..." : "Delete"}
            </button>
          ) : null}
          <button type="submit" disabled={saving} className="brand-button gap-2 disabled:cursor-not-allowed disabled:bg-landing-accent/50">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save content"}
          </button>
        </div>
      </div>
    </form>
  );
}
