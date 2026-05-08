import { Prisma } from '@prisma/client';

export interface ReaderPreferences {
  narrationPlayerExpanded?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeReaderPreferences(value: unknown): ReaderPreferences {
  if (!isRecord(value)) {
    return {};
  }

  const narrationPlayerExpanded = value.narrationPlayerExpanded;

  return typeof narrationPlayerExpanded === 'boolean'
    ? { narrationPlayerExpanded }
    : {};
}

export function mergeReaderPreferences(current: unknown, updates: ReaderPreferences): ReaderPreferences {
  const normalizedCurrent = normalizeReaderPreferences(current);
  const nextPreferences: ReaderPreferences = { ...normalizedCurrent };

  if (typeof updates.narrationPlayerExpanded === 'boolean') {
    nextPreferences.narrationPlayerExpanded = updates.narrationPlayerExpanded;
  }

  return nextPreferences;
}

export function toReaderPreferencesJson(preferences: ReaderPreferences): Prisma.InputJsonValue {
  return preferences as Prisma.InputJsonValue;
}