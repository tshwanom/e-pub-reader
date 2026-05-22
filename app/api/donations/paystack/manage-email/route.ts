import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserActivePaystackSubscriptionById } from '@/lib/donation-subscriptions';
import { resolvePublicAppOrigin, sendPaystackSubscriptionManageEmail } from '@/lib/donation-payments';

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

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const returnTo = typeof formData.get('returnTo') === 'string' ? String(formData.get('returnTo')) : null;
  const donationId = typeof formData.get('donationId') === 'string' ? String(formData.get('donationId')) : null;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    const callbackUrl = buildReturnUrl(request, returnTo).toString();
    const loginUrl = new URL('/login', resolvePublicAppOrigin(request));
    loginUrl.searchParams.set('callbackUrl', callbackUrl);
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const subscription = await getUserActivePaystackSubscriptionById({
    user: session.user,
    donationId,
  });

  if (!subscription?.paystackSubscriptionCode) {
    return NextResponse.redirect(buildReturnUrl(request, returnTo, 'manage-unavailable'), { status: 303 });
  }

  try {
    await sendPaystackSubscriptionManageEmail(subscription.paystackSubscriptionCode);
    return NextResponse.redirect(buildReturnUrl(request, returnTo, 'manage-email-sent'), { status: 303 });
  } catch (error) {
    console.error('Failed to email the Paystack subscription management link:', error);
    return NextResponse.redirect(buildReturnUrl(request, returnTo, 'manage-email-failed'), { status: 303 });
  }
}