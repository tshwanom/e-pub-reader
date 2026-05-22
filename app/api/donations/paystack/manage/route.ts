import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserActivePaystackSubscriptionById } from '@/lib/donation-subscriptions';
import { getPaystackSubscriptionManageLink, resolvePublicAppOrigin } from '@/lib/donation-payments';

function getSafeReturnPath(value?: string | null) {
  if (value && value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }

  return '/library';
}

function buildReturnUrl(request: NextRequest, returnTo?: string | null, status?: string) {
  const url = new URL(getSafeReturnPath(returnTo), resolvePublicAppOrigin(request));

  if (status) {
    url.searchParams.set('subscription', status);
  }

  return url;
}

export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get('returnTo');
  const donationId = request.nextUrl.searchParams.get('donationId');
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    const callbackUrl = buildReturnUrl(request, returnTo).toString();
    const loginUrl = new URL('/login', resolvePublicAppOrigin(request));
    loginUrl.searchParams.set('callbackUrl', callbackUrl);
    return NextResponse.redirect(loginUrl);
  }

  const subscription = await getUserActivePaystackSubscriptionById({
    user: session.user,
    donationId,
  });

  if (!subscription?.paystackSubscriptionCode) {
    return NextResponse.redirect(buildReturnUrl(request, returnTo, 'manage-unavailable'));
  }

  try {
    const manageLink = await getPaystackSubscriptionManageLink(subscription.paystackSubscriptionCode);
    return NextResponse.redirect(manageLink);
  } catch (error) {
    console.error('Failed to open Paystack subscription management page:', error);
    return NextResponse.redirect(buildReturnUrl(request, returnTo, 'manage-link-failed'));
  }
}