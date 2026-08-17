'use client';

import React from 'react';

export const TOUR_STEPS = [
  {
    title: 'Turn Pages',
    body: 'Swipe left or right to move between pages. On desktop, use the arrow buttons or keyboard arrow keys.',
    icon: (
      <svg className="mx-auto h-10 w-10 text-landing-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
      </svg>
    ),
  },
  {
    title: 'Reading Controls',
    body: 'Tap the menu icon at the top-right any time to change theme, font, size, or browse the table of contents.',
    icon: (
      <svg className="mx-auto h-10 w-10 text-landing-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
  {
    title: 'Auto-Saved Progress',
    body: 'Your exact reading position is saved automatically. Pick up right where you left off next time.',
    icon: (
      <svg className="mx-auto h-10 w-10 text-landing-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
];

interface ReaderTourModalProps {
  isOpen: boolean;
  tourStep: number;
  onSetTourStep: (step: number) => void;
  onDismissTour: () => void;
}

export default function ReaderTourModal({
  isOpen,
  tourStep,
  onSetTourStep,
  onDismissTour,
}: ReaderTourModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-3xl border border-landing-border bg-white p-8 shadow-2xl">
        <div className="mb-6 flex justify-center gap-2">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === tourStep ? 'w-6 bg-landing-accent' : 'w-2 bg-landing-border'
              }`}
            />
          ))}
        </div>
        <div className="mb-4">{TOUR_STEPS[tourStep].icon}</div>
        <h3 className="mb-2 text-center text-lg font-semibold text-landing-text">
          {TOUR_STEPS[tourStep].title}
        </h3>
        <p className="mb-8 text-center text-sm leading-relaxed text-landing-text-muted">
          {TOUR_STEPS[tourStep].body}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onDismissTour}
            className="flex-1 rounded-xl border border-landing-border py-2.5 text-sm text-landing-text-muted transition hover:border-landing-accent/40 hover:text-landing-text"
          >
            Skip
          </button>
          <button
            onClick={() => {
              if (tourStep < TOUR_STEPS.length - 1) onSetTourStep(tourStep + 1);
              else onDismissTour();
            }}
            className="flex-1 rounded-xl bg-landing-accent py-2.5 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary"
          >
            {tourStep < TOUR_STEPS.length - 1 ? 'Next' : 'Start Reading'}
          </button>
        </div>
      </div>
    </div>
  );
}
