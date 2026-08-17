'use client';

import React from 'react';
import type { ReaderPreviewConfig } from '../types';

interface ReaderLockBarrierProps {
  isLocked: boolean;
  title?: string;
  previewConfig?: ReaderPreviewConfig;
  onReturnToSample: () => void;
}

export default function ReaderLockBarrier({
  isLocked,
  title,
  previewConfig,
  onReturnToSample,
}: ReaderLockBarrierProps) {
  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="surface-card w-full max-w-lg p-6 sm:p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl text-amber-800">
          🔒
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-landing-accent">
          Sample Limit Reached
        </p>
        <h2 className="mt-2 font-playfair text-2xl sm:text-3xl font-semibold text-landing-text">
          “{title}” is reserved for {previewConfig?.lockedAudienceLabel || 'supporters'}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-landing-text-muted">
          You’ve enjoyed the free preview of this title. {previewConfig?.donorRequirementText || 'Support the mission to unlock the full book and audio narration.'}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href={previewConfig?.bookCanonicalPath ? `${previewConfig.bookCanonicalPath}#support-this-book` : '/support'}
            className="brand-button px-6 py-3 text-center"
          >
            Support to unlock full book
          </a>
          {previewConfig?.loginHref && (
            <a
              href={previewConfig.loginHref}
              className="ghost-button px-5 py-3 text-center"
            >
              Already supported? Sign in
            </a>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-landing-border">
          <button
            onClick={onReturnToSample}
            className="text-xs font-semibold text-landing-text-muted hover:text-landing-accent transition-colors"
          >
            ← Return to previous sample page
          </button>
        </div>
      </div>
    </div>
  );
}
