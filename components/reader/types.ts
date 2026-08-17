import type {
  NarrationFeatureResponse,
  NarrationManifest,
  NarrationManifestChapter,
  NarrationManifestCue,
} from '@/lib/narration';

export type {
  NarrationManifest,
  NarrationManifestChapter,
  NarrationManifestCue,
};

export interface ReaderPreviewConfig {
  isPreviewMode?: boolean;
  limitType?: 'CHAPTERS' | 'PERCENTAGE';
  limitValue?: number;
  lockedAudienceLabel?: string;
  donorRequirementText?: string;
  bookCanonicalPath?: string;
  loginHref?: string;
  isDonor?: boolean;
}

export interface ReaderNarrationAccess {
  hasAccess: boolean;
  isSignedIn: boolean;
  manageHref: string;
  statusEndpoint: string;
  isEnabled?: boolean;
}

export type NarrationStatusPayload = NarrationFeatureResponse;

export interface ReaderProps {
  url: string;
  initialLocation?: string | null;
  bookId: string;
  bookSlug?: string | null;
  title?: string;
  author?: string | null;
  canonicalBookPath?: string | null;
  progressSaveEndpoint?: string | null;
  initialNarrationPlayerExpanded?: boolean | null;
  narrationPlayerPreferenceEndpoint?: string | null;
  narrationAccess?: ReaderNarrationAccess;
  previewConfig?: ReaderPreviewConfig;
  translations?: {
    id: string;
    slug: string | null;
    language: string | null;
  }[];
}

export interface Highlight {
  id: string;
  cfi: string;
  text: string;
  color: string;
  note?: string;
}

export interface Bookmark {
  id: string;
  cfi: string;
  chapter?: string;
  label: string;
}

export interface SearchResult {
  cfi: string;
  excerpt: string;
}

export interface StandaloneNote {
  id: string;
  cfi: string;
  content: string;
  createdAt: string;
}

export type Theme = 'light' | 'dark' | 'sepia';
export type Flow = 'paginated' | 'scrolled';
export type FontFamily = 'Crimson Pro' | 'Inter' | 'Georgia';
export type LineSpacing = 1.4 | 1.6 | 1.9;
export type SidePanel = 'toc' | 'highlights' | 'notes' | 'bookmarks' | null;
export type NarrationPlaybackRate = 0.8 | 1 | 1.25 | 1.5;

export const NARRATION_PLAYBACK_RATES: NarrationPlaybackRate[] = [0.8, 1, 1.25, 1.5];
export const NARRATION_ACTIVE_ANNOTATION_STYLE = {
  fill: '#3D737A',
  'fill-opacity': '0.18',
  stroke: '#3D737A',
  'stroke-opacity': '0.55',
};
export const NARRATION_ACTIVE_ELEMENT_CLASS = 'omr-narration-active-cue';
export const NARRATION_EXCERPT_MATCH_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, div, span';
export const NARRATION_WRAPPER_ATTRIBUTE = 'data-omr-narration-wrapper';
export const NARRATION_PLAYER_PREFERENCE_KEY = 'reader-narration-player-expanded';
export const NARRATION_VOICE_PREFERENCE_KEY_PREFIX = 'reader-narration-voice';
