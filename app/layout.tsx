import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./uploadthing.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ePub Reader Platform",
  description: "Independent digital library and reader platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
