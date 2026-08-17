import type { Metadata } from "next";
import { Inter, Playfair_Display, Crimson_Pro } from "next/font/google";
import "./globals.css";
import OfflineSupport from "@/components/OfflineSupport";
import { getSiteUrl } from "@/lib/site";


const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ 
  subsets: ["latin"], 
  variable: "--font-playfair",
  weight: ["600", "700"]
});
const crimson = Crimson_Pro({ 
  subsets: ["latin"], 
  variable: "--font-crimson",
  weight: ["400"],
  style: ["italic"]
});

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: "One Man Revolution | A Quiet Rebellion",
  description: "A quiet rebellion against systems that dehumanize, silence, and fracture the human spirit. Free books on spiritual awakening and inner sovereignty.",
  applicationName: 'One Man Revolution',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'One Man Revolution | A Quiet Rebellion',
    description: 'A quiet rebellion against systems that dehumanize, silence, and fracture the human spirit. Free books on spiritual awakening and inner sovereignty.',
    url: '/',
    siteName: 'One Man Revolution',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/logo.png',
        secureUrl: '/logo.png',
        width: 512,
        height: 512,
        alt: 'One Man Revolution',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'One Man Revolution | A Quiet Rebellion',
    description: 'A quiet rebellion against systems that dehumanize, silence, and fracture the human spirit. Free books on spiritual awakening and inner sovereignty.',
    images: ['/logo.png'],
  },
  icons: {
    icon: '/logo.png',
  },
};

import { cookies } from "next/headers";
import { LanguageProvider } from "@/lib/i18n-client";
import { Locale } from "@/lib/i18n-translations";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = (cookieStore.get("NEXT_LOCALE")?.value || "en") as Locale;
  const isRtl = locale === "ar";

  return (
    <html lang={locale} dir={isRtl ? "rtl" : "ltr"}>
      <body className={`${inter.variable} ${playfair.variable} ${crimson.variable} ${inter.className} overflow-x-hidden`}>
        <LanguageProvider initialLocale={locale}>
          <OfflineSupport />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
