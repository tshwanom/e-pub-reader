import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  mergeReaderPreferences,
  normalizeReaderPreferences,
  toReaderPreferencesJson,
} from '@/lib/reader-preferences';

function getSessionUserId(session: { user?: { id?: string | null } } | null) {
  const userId = session?.user?.id;

  return typeof userId === 'string' && userId.trim().length > 0
    ? userId
    : null;
}

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function userNotFoundResponse() {
  return NextResponse.json({ error: 'User not found' }, { status: 404 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return unauthorizedResponse();
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { readerPreferences: true },
  });

  if (!user) {
    return userNotFoundResponse();
  }

  return NextResponse.json({
    preferences: normalizeReaderPreferences(user.readerPreferences),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return unauthorizedResponse();
  }

  try {
    let payload: unknown;

    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (typeof (payload as { narrationPlayerExpanded?: unknown })?.narrationPlayerExpanded !== 'boolean') {
      return NextResponse.json({ error: 'Invalid preference payload' }, { status: 400 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { readerPreferences: true },
    });

    if (!currentUser) {
      return userNotFoundResponse();
    }

    const nextPreferences = mergeReaderPreferences(currentUser?.readerPreferences, {
      narrationPlayerExpanded: (payload as { narrationPlayerExpanded: boolean }).narrationPlayerExpanded,
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        readerPreferences: toReaderPreferencesJson(nextPreferences),
      },
    });

    return NextResponse.json({ preferences: nextPreferences });
  } catch (error) {
    console.error('Reader preference update error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}