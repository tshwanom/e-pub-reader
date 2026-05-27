export type ContentCommentAuthor = {
  name?: string | null;
  email?: string | null;
};

export function getContentCommentAuthorName(author?: ContentCommentAuthor | null) {
  const trimmedName = author?.name?.trim();

  if (trimmedName) {
    return trimmedName;
  }

  const trimmedEmail = author?.email?.trim();

  if (!trimmedEmail) {
    return 'OMR Reader';
  }

  const [localPart] = trimmedEmail.split('@');
  return localPart?.trim() || 'OMR Reader';
}

export function getContentCommentAuthorInitial(authorName: string) {
  const trimmedName = authorName.trim();

  if (!trimmedName) {
    return 'O';
  }

  return trimmedName.charAt(0).toUpperCase();
}