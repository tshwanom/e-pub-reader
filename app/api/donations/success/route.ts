import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || "sandbox";
const PAYPAL_API_BASE =
  PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal credentials are not configured");
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error("Failed to authenticate with PayPal");
  }

  const data = await response.json();
  return data.access_token as string;
}

function buildDestination(request: NextRequest, bookId?: string | null, status: "success" | "failed" = "success") {
  const pathname = bookId ? `/books/${bookId}` : "/library";
  return new URL(`${pathname}?donation=${status}`, request.url);
}

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("token");

  if (!orderId) {
    return NextResponse.redirect(buildDestination(request, null, "failed"));
  }

  const donation = await prisma.donation.findUnique({
    where: { paypalId: orderId },
    select: {
      id: true,
      bookId: true,
      status: true,
    },
  });

  if (!donation) {
    return NextResponse.redirect(buildDestination(request, null, "failed"));
  }

  if (donation.status === "COMPLETED") {
    return NextResponse.redirect(buildDestination(request, donation.bookId, "success"));
  }

  try {
    const accessToken = await getPayPalAccessToken();

    const captureResponse = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const captureData = await captureResponse.json();

    if (!captureResponse.ok || captureData.status !== "COMPLETED") {
      console.error("PayPal capture error:", captureData);

      await prisma.donation.update({
        where: { id: donation.id },
        data: { status: "FAILED" },
      });

      return NextResponse.redirect(buildDestination(request, donation.bookId, "failed"));
    }

    await prisma.donation.update({
      where: { id: donation.id },
      data: { status: "COMPLETED" },
    });

    return NextResponse.redirect(buildDestination(request, donation.bookId, "success"));
  } catch (error) {
    console.error("Donation capture error:", error);

    await prisma.donation
      .update({
        where: { id: donation.id },
        data: { status: "FAILED" },
      })
      .catch(() => undefined);

    return NextResponse.redirect(buildDestination(request, donation.bookId, "failed"));
  }
}