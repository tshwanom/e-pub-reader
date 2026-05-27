import { slugifyContentTitle } from '@/lib/content';

export type BookRouteTarget = {
  id: string;
  slug?: string | null;
};

export function getBookRouteIdentifier(book: BookRouteTarget) {
  return book.slug?.trim() || book.id;
}

export function getBookPath(book: BookRouteTarget) {
  return `/books/${getBookRouteIdentifier(book)}`;
}

export function getBookReadPath(book: BookRouteTarget) {
  return `/read/${getBookRouteIdentifier(book)}`;
}

export function slugifyBookTitle(value: string) {
  return slugifyContentTitle(value) || 'book';
}