import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  mergeReaderPreferences,
  normalizeReaderPreferences,
  toReaderPreferencesJson,
} from '@/lib/reader-preferences';

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { readerPreferences: true },
  });

  return NextResponse.json({
    preferences: normalizeReaderPreferences(user?.readerPreferences),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = await req.json();

    if (typeof payload?.narrationPlayerExpanded !== 'boolean') {
      return NextResponse.json({ error: 'Invalid preference payload' }, { status: 400 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { readerPreferences: true },
    });

    const nextPreferences = mergeReaderPreferences(currentUser?.readerPreferences, {
      narrationPlayerExpanded: payload.narrationPlayerExpanded,
    });

    await prisma.user.update({
      where: { id: session.user.id },
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