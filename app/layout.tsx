import type { Metadata } from "next";
import { Inter, Playfair_Display, Crimson_Pro } from "next/font/google";
import "./globals.css";
import OfflineSupport from "@/components/OfflineSupport";


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
  title: "One Man Revolution | A Quiet Rebellion",
  description: "A quiet rebellion against systems that dehumanize, silence, and fracture the human spirit. Free books on spiritual awakening and inner sovereignty.",
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} ${crimson.variable} ${inter.className}`}>
        <OfflineSupport />
        {children}
      </body>
    </html>
  );
}
