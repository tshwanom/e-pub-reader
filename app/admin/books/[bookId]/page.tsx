'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import Link from 'next/link';
import { ArrowLeft, BookOpenText, ImageIcon, Save, Sparkles, Trash2 } from 'lucide-react';
import NarrationStudio from './_components/NarrationStudio';

interface PrintLink {
  id?: string;
  provider: string;
  url: string;
  format: string;
}

interface SupplementaryContent {
  id?: string;
  type: 'VIDEO' | 'ARTICLE' | 'POEM' | 'QUOTE';
  title: string;
  content?: string;
  url?: string;
  author?: string;
}

interface BookForm {
  title: string;
  author: string;
  description: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  donorOnly: boolean;
  donationEnabled: boolean;
  donationMessage?: string;
  donationGoal?: number;
  amazonKdpUrl?: string;
  printLinks: PrintLink[];
  supplementaryContents: SupplementaryContent[];
}

export default function EditBookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookId, setBookId] = useState<string>('');
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [extractingCover, setExtractingCover] = useState(false);
  
  const { register, handleSubmit, reset, control, watch } = useForm<BookForm>({
    defaultValues: {
      donorOnly: false,
      printLinks: [],
      supplementaryContents: [],
    },
  });

  const { fields: printLinkFields, append: appendPrintLink, remove: removePrintLink } = useFieldArray({
    control,
    name: 'printLinks',
  });

  const { fields: contentFields, append: appendContent, remove: removeContent } = useFieldArray({
    control,
    name: 'supplementaryContents',
  });

  const donorOnly = watch('donorOnly');
  const bookTitle = watch('title');
  const bookStatus = watch('status');

  const fetchBook = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/books/${id}?include=printLinks,supplementaryContents`);
      if (!res.ok) throw new Error('Failed to fetch book');
      const data = await res.json();
      reset({
        title: data.title,
        author: data.author,
        description: data.description,
        status: data.status,
        donorOnly: data.donorOnly || false,
        donationEnabled: data.donationEnabled || false,
        donationMessage: data.donationMessage || '',
        donationGoal: data.donationGoal ? Number(data.donationGoal) : undefined,
        amazonKdpUrl: data.amazonKdpUrl || '',
        printLinks: data.printLinks || [],
        supplementaryContents: data.supplementaryContents || [],
      });
      setCoverUrl(data.coverUrl);
    } catch (err) {
      setError('Could not load book details');
    } finally {
      setLoading(false);
    }
  }, [reset]);

  useEffect(() => {
    let isActive = true;

    const loadBook = async () => {
      const resolvedParams = await params;

      if (!isActive) {
        return;
      }

      setBookId(resolvedParams.bookId);
      await fetchBook(resolvedParams.bookId);
    };

    void loadBook();

    return () => {
      isActive = false;
    };
  }, [fetchBook, params]);

  const onSubmit = async (data: BookForm) => {
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error('Failed to update book');
      
      router.push('/admin/books');
      router.refresh();
    } catch (err) {
      alert('Failed to update book');
    }
  };

  const extractCover = async () => {
    setExtractingCover(true);
    try {
      const res = await fetch(`/api/books/${bookId}/extract-cover`, {
        method: 'POST',
      });

      if (res.ok) {
        const { coverUrl: newCoverUrl } = await res.json();
        setCoverUrl(newCoverUrl);
        alert('Cover extracted successfully!');
      } else {
        const error = await res.json();
        alert(`Failed to extract cover: ${error.details || error.error}`);
      }
    } catch (err) {
      alert('Error extracting cover');
    } finally {
      setExtractingCover(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this book? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete book');

      router.push('/admin/books');
      router.refresh();
    } catch (err) {
      alert('Failed to delete book');
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="surface-card p-8 text-rose-600">{error}</div>;

  return (
    <div className="space-y-6">
      <section className="surface-card p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="relative h-40 w-28 overflow-hidden rounded-2xl bg-white ring-1 ring-landing-border/70">
              {coverUrl && coverUrl !== '/placeholder-cover.jpg' ? (
                <Image
                  src={coverUrl}
                  alt={`${bookTitle || 'Book'} cover`}
                  fill
                  unoptimized
                  sizes="112px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-landing-text-muted">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
                Book editor
              </p>
              <h1 className="mt-2 font-playfair text-3xl text-landing-text sm:text-4xl">
                {bookTitle || 'Untitled book'}
              </h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  bookStatus === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' : bookStatus === 'ARCHIVED' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {bookStatus || 'DRAFT'}
                </span>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  donorOnly ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-700'
                }`}>
                  {donorOnly ? 'Donor-only access' : 'Public access'}
                </span>
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-landing-text-muted sm:text-[15px]">
                Update the catalog metadata, refine the donor access settings, and launch Gemini narration generation from one place.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => router.back()} className="ghost-button gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-100 px-5 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-200"
            >
              <Trash2 className="h-4 w-4" />
              Delete book
            </button>
          </div>
        </div>
      </section>

      {bookId ? <NarrationStudio bookId={bookId} /> : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <section className="surface-card p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">Cover</p>
              <h2 className="mt-2 text-xl font-semibold text-landing-text">Refresh the visual presentation</h2>
              <p className="mt-2 text-sm leading-6 text-landing-text-muted">
                Pull the cover again from the EPUB if you updated the source file or want to recover a better embedded image.
              </p>
            </div>
            <button
              type="button"
              onClick={extractCover}
              disabled={extractingCover}
              className="brand-button self-start gap-2 disabled:cursor-not-allowed disabled:bg-landing-accent/50"
            >
              <Sparkles className="h-4 w-4" />
              {extractingCover ? 'Extracting...' : 'Extract from EPUB'}
            </button>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <section className="surface-card p-6 sm:p-8 space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">Metadata</p>
                <h2 className="mt-2 text-xl font-semibold text-landing-text">Core book details</h2>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-landing-text">Title</label>
                <input
                  {...register('title', { required: true })}
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-landing-text">Author</label>
                <input
                  {...register('author', { required: true })}
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-landing-text">Description</label>
                <textarea
                  {...register('description')}
                  rows={6}
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm leading-6 text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-landing-text">Status</label>
                <select 
                  {...register('status')}
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
            </section>

            <section className="surface-card p-6 sm:p-8 space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">Access</p>
                <h2 className="mt-2 text-xl font-semibold text-landing-text">Who can open this book?</h2>
              </div>

              <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-white/65">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    {...register('donorOnly')}
                    className="mt-1 h-4 w-4 rounded border-landing-border text-landing-accent focus:ring-landing-accent"
                  />
                  <div>
                    <label className="block text-sm font-semibold text-landing-text">
                      Restrict this book to donors
                    </label>
                    <p className="mt-2 text-sm leading-6 text-landing-text-muted">
                      Readers must be signed in and have at least one completed donation before they can open this title. The narration player will follow the same donor gate.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="surface-card p-6 sm:p-8 space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">Monetization</p>
                <h2 className="mt-2 text-xl font-semibold text-landing-text">Support and fundraising</h2>
              </div>
              
              <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-white/65">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    {...register('donationEnabled')}
                    className="h-4 w-4 rounded border-landing-border text-landing-accent focus:ring-landing-accent"
                  />
                  <label className="text-sm font-semibold text-landing-text">
                    Enable donations for this book
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-landing-text">
                  Donation Message
                </label>
                <textarea
                  {...register('donationMessage')}
                  rows={4}
                  placeholder="Explain why readers should support this book..."
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm leading-6 text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-landing-text">
                  Donation Goal (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  {...register('donationGoal')}
                  placeholder="e.g., 1000"
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                />
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="surface-card p-6 sm:p-8 space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">Print distribution</p>
                <h2 className="mt-2 text-xl font-semibold text-landing-text">Print-on-demand links</h2>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-landing-text">
                  Amazon KDP URL
                </label>
                <input
                  type="url"
                  {...register('amazonKdpUrl')}
                  placeholder="https://www.amazon.com/dp/..."
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                />
              </div>

              <div className="border-t border-landing-border/70 pt-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-landing-text">
                    Other Print Providers
                  </label>
                  <button
                    type="button"
                    onClick={() => appendPrintLink({ provider: '', url: '', format: 'PAPERBACK' })}
                    className="inline-flex items-center justify-center rounded-xl bg-landing-accent/10 px-3 py-2 text-sm font-semibold text-landing-accent transition-colors hover:bg-landing-accent/15"
                  >
                    + Add provider
                  </button>
                </div>

                {printLinkFields.map((field, index) => (
                  <div key={field.id} className="mb-3 rounded-2xl bg-white/70 p-3 ring-1 ring-white/65">
                    <div className="grid gap-3">
                      <input
                        {...register(`printLinks.${index}.provider` as const)}
                        placeholder="Provider name (e.g., IngramSpark)"
                        className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                      />
                      <input
                        {...register(`printLinks.${index}.url` as const)}
                        placeholder="https://..."
                        className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                      />
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <select
                          {...register(`printLinks.${index}.format` as const)}
                          className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                        >
                          <option value="PAPERBACK">Paperback</option>
                          <option value="HARDCOVER">Hardcover</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removePrintLink(index)}
                          className="inline-flex items-center justify-center rounded-xl bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-200"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {printLinkFields.length === 0 && (
                  <p className="text-sm italic text-landing-text-muted">
                    No additional print providers configured
                  </p>
                )}
              </div>
            </section>

            <section className="surface-card p-6 sm:p-8">
              <div className="flex items-start gap-3">
                <span className="rounded-2xl bg-landing-accent/10 p-3 text-landing-accent">
                  <BookOpenText className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">Publishing note</p>
                  <h2 className="mt-2 text-xl font-semibold text-landing-text">Reader-facing impact</h2>
                  <p className="mt-2 text-sm leading-6 text-landing-text-muted">
                    {donorOnly
                      ? 'This book will require a completed donation before readers can open it or access the narrated mode.'
                      : 'This book is currently public, but narrated mode can still remain donor-only even if the main EPUB is open to everyone.'}
                  </p>
                  <p className="mt-4 text-sm text-landing-text-muted">
                    After saving, open the reader and donor journey from the public side to verify access and playback exactly as a supporter would see it.
                  </p>
                  <div className="mt-5">
                    <Link href={`/books/${bookId}`} className="ghost-button gap-2">
                      Preview public page
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="surface-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-landing-text">Save catalog changes</p>
            <p className="mt-1 text-sm text-landing-text-muted">
              Metadata, donor access, donation messaging, and print links are all saved together.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => router.back()}
              className="ghost-button"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="brand-button gap-2"
            >
              <Save className="h-4 w-4" />
              Save changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
