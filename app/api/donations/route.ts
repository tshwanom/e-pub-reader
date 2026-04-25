import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PayPal configuration
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_API_BASE =
  PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

async function getPayPalAccessToken() {
  const auth = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();
  return data.access_token;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  
  const { bookId, amount } = await req.json();

  if (!amount || amount < 1) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  const book = bookId
    ? await prisma.book.findUnique({
        where: { id: bookId },
        select: {
          id: true,
          title: true,
          donorOnly: true,
          status: true,
        },
      })
    : null;

  if (bookId && !book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  if (book && book.status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Book not available for donations' }, { status: 400 });
  }

  if (book?.donorOnly && !session?.user?.id) {
    return NextResponse.json(
      { error: 'Please sign in before donating to unlock donor-only books.' },
      { status: 401 }
    );
  }

  try {
    const accessToken = await getPayPalAccessToken();

    // Create PayPal order
    const orderResponse = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: amount.toFixed(2),
            },
            description: book
              ? `Support for “${book.title}”`
              : 'General donation',
          },
        ],
        application_context: {
          return_url: `${process.env.NEXTAUTH_URL}/api/donations/success`,
          cancel_url: `${process.env.NEXTAUTH_URL}${book ? `/books/${book.id}` : '/library'}`,
        },
      }),
    });

    const orderData = await orderResponse.json();

    if (!orderResponse.ok) {
      console.error('PayPal error:', orderData);
      return NextResponse.json(
        { error: 'Failed to create PayPal order' },
        { status: 500 }
      );
    }

    // Create pending donation record
    await prisma.donation.create({
      data: {
        userId: session?.user?.id,
        bookId: book?.id,
        amount,
        currency: 'USD',
        paypalId: orderData.id,
        status: 'PENDING',
      },
    });

    // Get approval URL
    const approvalUrl = orderData.links.find(
      (link: any) => link.rel === 'approve'
    )?.href;

    if (!approvalUrl) {
      return NextResponse.json(
        { error: 'PayPal approval URL missing from response' },
        { status: 500 }
      );
    }

    return NextResponse.json({ approvalUrl });
  } catch (error) {
    console.error('Donation error:', error);
    return NextResponse.json(
      { error: 'Failed to process donation' },
      { status: 500 }
    );
  }
}
