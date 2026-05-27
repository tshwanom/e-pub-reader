import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { getContentAccessState } from '@/lib/book-access';
import {
  CONTENT_FEATURE_UNAVAILABLE_MESSAGE,
  isContentFeatureUnavailableError,
  withContentFeatureFallback,
} from '@/lib/content';
import { getContentCommentAuthorInitial, getContentCommentAuthorName } from '@/lib/content-comments';
import { prisma } from '@/lib/prisma';

const COMMENT_BODY_LIMIT = 1500;

const contentCommentSelect = {
  id: true,
  userId: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      name: true,
      email: true,
    },
  },
} as const;

function createUnavailableResponse() {
  return NextResponse.json({ error: CONTENT_FEATURE_UNAVAILABLE_MESSAGE }, { status: 503 });
}

function serializeComment(
  comment: {
    id: string;
    userId: string;
    body: string;
    createdAt: Date;
    updatedAt: Date;
    user: {
      name: string | null;
      email: string | null;
    };
  },
  currentUserId?: string | null
) {
  const authorName = getContentCommentAuthorName(comment.user);

  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    authorName,
    authorInitial: getContentCommentAuthorInitial(authorName),
    isCurrentUser: Boolean(currentUserId && currentUserId === comment.userId),
  };
}

async function getVideoContent(contentId: string) {
  return prisma.supplementaryContent.findUnique({
    where: { id: contentId },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      donorOnly: true,
      donorAccessLevel: true,
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const session = await getServerSession(authOptions);
  const { contentId } = await params;

  try {
    const content = await getVideoContent(contentId);

    if (!content || content.type !== 'VIDEO' || content.status !== 'PUBLISHED') {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    const access = await getContentAccessState(content, session?.user);

    if (access.requiresDonation && !access.hasAccess) {
      return NextResponse.json(
        { error: 'Comments for this video unlock with the video access tier.' },
        { status: 403 }
      );
    }

    const [comments, count] = await withContentFeatureFallback(
      async () => Promise.all([
        prisma.contentComment.findMany({
          where: { contentId },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: contentCommentSelect,
        }),
        prisma.contentComment.count({ where: { contentId } }),
      ]),
      [[], 0] as [Array<any>, number],
      `content comments ${contentId}`
    );

    return NextResponse.json({
      count,
      comments: comments.map((comment) => serializeComment(comment, session?.user?.id)),
    });
  } catch (error) {
    if (isContentFeatureUnavailableError(error)) {
      console.error('List content comments error (content feature unavailable):', error);
      return createUnavailableResponse();
    }

    console.error('List content comments error:', error);
    return NextResponse.json({ error: 'Failed to load comments' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { contentId } = await params;

  try {
    const content = await getVideoContent(contentId);

    if (!content || content.type !== 'VIDEO' || content.status !== 'PUBLISHED') {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    const access = await getContentAccessState(content, session.user);

    if (!access.hasAccess) {
      return NextResponse.json({ error: 'You do not have access to comment on this video.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as { body?: string | null } | null;
    const trimmedBody = body?.body?.trim() || '';

    if (!trimmedBody) {
      return NextResponse.json({ error: 'Comment text is required.' }, { status: 400 });
    }

    if (trimmedBody.length > COMMENT_BODY_LIMIT) {
      return NextResponse.json(
        { error: `Comments must be ${COMMENT_BODY_LIMIT} characters or fewer.` },
        { status: 400 }
      );
    }

    const created = await prisma.contentComment.create({
      data: {
        contentId,
        userId: session.user.id,
        body: trimmedBody,
      },
      select: contentCommentSelect,
    });

    return NextResponse.json(serializeComment(created, session.user.id), { status: 201 });
  } catch (error) {
    if (isContentFeatureUnavailableError(error)) {
      console.error('Create content comment error (content feature unavailable):', error);
      return createUnavailableResponse();
    }

    console.error('Create content comment error:', error);
    return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 });
  }
}