export const BOOK_DONOR_ACCESS_LEVEL_VALUES = [
  'PUBLIC',
  'ALL_DONORS',
  'RECURRING_DONORS',
] as const;

export type BookDonorAccessLevel = (typeof BOOK_DONOR_ACCESS_LEVEL_VALUES)[number];

export const DONOR_TIER_VALUES = ['NONE', 'ONE_TIME', 'RECURRING'] as const;

export type DonorTier = (typeof DONOR_TIER_VALUES)[number];

export const BOOK_DONOR_ACCESS_LEVEL_OPTIONS = [
  {
    id: 'PUBLIC',
    label: 'Public',
    description: 'Anyone can open this book without donating.',
  },
  {
    id: 'ALL_DONORS',
    label: 'All donors',
    description: 'Any completed donation unlocks this book.',
  },
  {
    id: 'RECURRING_DONORS',
    label: 'Recurring donors',
    description: 'Only readers with an active monthly donation can open this book.',
  },
] as const satisfies ReadonlyArray<{
  id: BookDonorAccessLevel;
  label: string;
  description: string;
}>;

export type BookDonorAccessLike = {
  donorAccessLevel?: string | null;
  donorOnly?: boolean | null;
};

export function isBookDonorAccessLevel(value: unknown): value is BookDonorAccessLevel {
  return BOOK_DONOR_ACCESS_LEVEL_VALUES.includes(value as BookDonorAccessLevel);
}

export function resolveBookDonorAccessLevel(book?: BookDonorAccessLike | null): BookDonorAccessLevel {
  if (isBookDonorAccessLevel(book?.donorAccessLevel)) {
    return book.donorAccessLevel;
  }

  return book?.donorOnly ? 'ALL_DONORS' : 'PUBLIC';
}

export function isDonorRestrictedBook(level: BookDonorAccessLevel) {
  return level !== 'PUBLIC';
}

export function isRecurringDonorBook(level: BookDonorAccessLevel) {
  return level === 'RECURRING_DONORS';
}

export function hasBookAccessForDonorTier(level: BookDonorAccessLevel, donorTier: DonorTier) {
  switch (level) {
    case 'PUBLIC':
      return true;
    case 'ALL_DONORS':
      return donorTier === 'ONE_TIME' || donorTier === 'RECURRING';
    case 'RECURRING_DONORS':
      return donorTier === 'RECURRING';
    default:
      return false;
  }
}

export function formatBookDonorAccessLevel(level: BookDonorAccessLevel) {
  switch (level) {
    case 'ALL_DONORS':
      return 'All donors';
    case 'RECURRING_DONORS':
      return 'Recurring donors';
    case 'PUBLIC':
    default:
      return 'Public';
  }
}

export function getBookAccessBadgeLabel(level: BookDonorAccessLevel, hasAccess: boolean) {
  switch (level) {
    case 'ALL_DONORS':
      return hasAccess ? 'Donor Access' : 'All Donors';
    case 'RECURRING_DONORS':
      return hasAccess ? 'Recurring Access' : 'Recurring Donors';
    case 'PUBLIC':
    default:
      return 'Public';
  }
}

export function getBookLockedAudienceLabel(level: BookDonorAccessLevel) {
  switch (level) {
    case 'ALL_DONORS':
      return 'donors';
    case 'RECURRING_DONORS':
      return 'recurring donors';
    case 'PUBLIC':
    default:
      return 'everyone';
  }
}

export function getBookDonorRequirementText(level: BookDonorAccessLevel) {
  switch (level) {
    case 'ALL_DONORS':
      return 'at least one completed donation';
    case 'RECURRING_DONORS':
      return 'an active monthly donation';
    case 'PUBLIC':
    default:
      return 'no donation';
  }
}

export function getBookSupportCallToAction(level: BookDonorAccessLevel) {
  switch (level) {
    case 'ALL_DONORS':
      return 'Donate to unlock';
    case 'RECURRING_DONORS':
      return 'Donate monthly to unlock';
    case 'PUBLIC':
    default:
      return 'Open donation';
  }
}
