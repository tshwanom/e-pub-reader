'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { Loader2, Lock, MessageSquareText, Send, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';

type VideoComment = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorInitial: string;
  isCurrentUser: boolean;
};

type VideoCommentsModalProps = {
  contentId: string;
  videoTitle: string;
  initialComments: VideoComment[];
  initialCount: number;
  canViewComments: boolean;
  canPostComments: boolean;
  isSignedIn: boolean;
  loginHref: string;
  supportHref: string;
  supportLabel: string;
};

const MAX_COMMENT_LENGTH = 1500;

function formatCommentDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export default function VideoCommentsModal({
  contentId,
  videoTitle,
  initialComments,
  initialCount,
  canViewComments,
  canPostComments,
  isSignedIn,
  loginHref,
  supportHref,
  supportLabel,
}: VideoCommentsModalProps) {
  const modalTitleId = useId();
  const modalDescriptionId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [comments, setComments] = useState(initialComments);
  const [commentsCount, setCommentsCount] = useState(initialCount);
  const [draft, setDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const remainingCharacters = useMemo(() => MAX_COMMENT_LENGTH - draft.length, [draft.length]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    setPortalContainer(document.body);
  }, []);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const closeModal = () => {
    setIsOpen(false);
    setErrorMessage(null);
  };

  const handleSubmit = async () => {
    const trimmedDraft = draft.trim();

    if (!trimmedDraft) {
      setErrorMessage('Write a comment before posting it.');
      return;
    }

    if (trimmedDraft.length > MAX_COMMENT_LENGTH) {
      setErrorMessage(`Comments must stay under ${MAX_COMMENT_LENGTH} characters.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/content/${contentId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: trimmedDraft }),
      });

      const payload = await response.json().catch(() => null) as { error?: string } & VideoComment | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error || 'Unable to post your comment right now.');
      }

      setComments((currentComments) => [payload as VideoComment, ...currentComments]);
      setCommentsCount((currentCount) => currentCount + 1);
      setDraft('');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to post your comment right now.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-landing-border/70 bg-white/80 px-3.5 py-2 text-sm font-medium text-landing-text transition-all duration-200 hover:border-landing-accent/35 hover:text-landing-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
      >
        <MessageSquareText className="h-4 w-4" />
        Comments
        <span className="rounded-full bg-landing-surface-muted px-2 py-0.5 text-xs font-semibold text-landing-text-muted">
          {commentsCount}
        </span>
      </button>

      {isOpen && portalContainer
        ? createPortal(
            <div
              className="fixed inset-0 z-[90] overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  closeModal();
                }
              }}
            >
              <div className="flex min-h-full items-end justify-center sm:items-center">
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={modalTitleId}
                  aria-describedby={modalDescriptionId}
                  className="surface-card my-6 w-full max-w-3xl overflow-hidden shadow-2xl"
                >
                  <div className="flex items-start justify-between gap-4 border-b border-landing-border/70 bg-white/75 px-5 py-4 backdrop-blur-sm sm:px-6 sm:py-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-landing-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-landing-accent">
                          Viewer discussion
                        </span>
                        <span className="rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-medium text-landing-text-muted ring-1 ring-landing-border/70">
                          {commentsCount} {commentsCount === 1 ? 'comment' : 'comments'}
                        </span>
                      </div>
                      <h2 id={modalTitleId} className="mt-3 font-playfair text-2xl font-semibold leading-tight text-landing-text sm:text-3xl">
                        Comments on “{videoTitle}”
                      </h2>
                      <p id={modalDescriptionId} className="mt-2 max-w-2xl text-xs leading-6 text-landing-text-muted sm:text-sm">
                        A focused discussion space for this screening — tucked into a modal so the watch page stays calm and player-first.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={closeModal}
                      className="rounded-full border border-landing-border bg-white/90 p-1.5 text-landing-text-muted shadow-sm transition-colors hover:border-landing-accent/35 hover:text-landing-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2 sm:p-2"
                      aria-label="Close comments modal"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid max-h-[85vh] gap-0 md:grid-cols-[minmax(0,1fr)_20rem]">
                    <div className="flex min-h-0 flex-col border-b border-landing-border/70 md:border-b-0 md:border-r">
                      <div className="max-h-[55vh] overflow-y-auto px-5 py-5 sm:px-6">
                        {canViewComments ? (
                          comments.length > 0 ? (
                            <div className="space-y-4">
                              {comments.map((comment) => (
                                <article key={comment.id} className="rounded-2xl bg-white/65 p-4 ring-1 ring-white/70">
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-landing-accent/10 text-sm font-semibold text-landing-accent ring-1 ring-landing-accent/10">
                                      {comment.authorInitial}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-semibold text-landing-text">
                                          {comment.authorName}
                                        </p>
                                        {comment.isCurrentUser ? (
                                          <span className="rounded-full bg-landing-surface-muted px-2 py-0.5 text-[11px] font-medium text-landing-text-muted">
                                            You
                                          </span>
                                        ) : null}
                                        <span className="text-xs text-landing-text-muted">
                                          {formatCommentDate(comment.createdAt)}
                                        </span>
                                      </div>
                                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-landing-text-muted">
                                        {comment.body}
                                      </p>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-2xl bg-white/65 p-5 text-sm leading-6 text-landing-text-muted ring-1 ring-white/70">
                              No comments yet. Be the first reader to leave a thought on this screening.
                            </div>
                          )
                        ) : (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-5 text-sm leading-6 text-amber-900 ring-1 ring-amber-100">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 rounded-xl bg-amber-100 p-2 text-amber-700" aria-hidden="true">
                                <Lock className="h-4 w-4" />
                              </span>
                              <div>
                                <p className="font-semibold text-amber-950">Comments unlock with the video</p>
                                <p className="mt-2 text-amber-800">
                                  This discussion stays behind the same supporter access as the screening itself.
                                </p>
                                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                                  <Link href={isSignedIn ? supportHref : loginHref} className="brand-button px-4 py-2.5 text-center text-sm">
                                    {isSignedIn ? supportLabel : 'Sign in to unlock'}
                                  </Link>
                                  <Link href="/videos" className="ghost-button px-4 py-2.5 text-center text-sm">
                                    Browse videos
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {canViewComments ? (
                        <div className="border-t border-landing-border/70 bg-white/55 px-5 py-4 sm:px-6">
                          {canPostComments ? (
                            <div>
                              <label htmlFor={`${modalTitleId}-draft`} className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                                Add your comment
                              </label>
                              <textarea
                                id={`${modalTitleId}-draft`}
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                rows={4}
                                placeholder="Share a thoughtful reaction, an insight, or a timestamp worth revisiting…"
                                className="mt-3 w-full resize-none rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm leading-6 text-landing-text shadow-sm outline-none transition-colors focus:border-landing-accent focus:ring-2 focus:ring-landing-accent/20"
                              />

                              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-xs text-landing-text-muted">
                                  {remainingCharacters} characters remaining
                                </div>

                                <button
                                  type="button"
                                  onClick={() => void handleSubmit()}
                                  disabled={isSubmitting || draft.trim().length === 0 || draft.length > MAX_COMMENT_LENGTH}
                                  className="brand-button inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                  Post comment
                                </button>
                              </div>

                              {errorMessage ? (
                                <p className="mt-3 text-sm text-rose-600">{errorMessage}</p>
                              ) : null}
                            </div>
                          ) : (
                            <div className="rounded-2xl bg-landing-surface-muted p-4 text-sm leading-6 text-landing-text-muted">
                              <p className="font-medium text-landing-text">Sign in to join the discussion</p>
                              <p className="mt-1">You can read public comments already, but posting requires an account.</p>
                              <Link href={loginHref} className="brand-button mt-4 inline-flex px-4 py-2.5 text-sm">
                                Sign in to comment
                              </Link>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <aside className="bg-white/45 px-5 py-5 sm:px-6">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Discussion notes</p>
                      <div className="mt-4 space-y-3 text-sm leading-6 text-landing-text-muted">
                        <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-white/70">
                          Keep it thoughtful, concise, and relevant to the video.
                        </div>
                        <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-white/70">
                          If a moment stands out, mention the timestamp so others can find it quickly.
                        </div>
                        <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-white/70">
                          This modal keeps the conversation close at hand without cluttering the watch page itself.
                        </div>
                      </div>
                    </aside>
                  </div>
                </div>
              </div>
            </div>,
            portalContainer,
          )
        : null}
    </>
  );
}