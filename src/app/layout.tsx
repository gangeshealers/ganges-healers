import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navigation/Navbar";
import SiteFooter from "@/components/navigation/SiteFooter";
import { Toaster } from "@/components/ui/sonner";
import CartDrawer from "@/components/store/LazyCartDrawer";
import SkipLink from "@/components/a11y/SkipLink";
import MetaPixelScript from "@/components/analytics/MetaPixelScript";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ganges Healers",
  description: "Your trusted healthcare partner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <MetaPixelScript />
        <Providers>
          <div className="flex min-h-screen flex-col bg-background">
            <SkipLink />
            <Navbar />
            <main id="main-content" className="flex-1">{children}</main>
            <SiteFooter />
          </div>
          <Toaster />
          <CartDrawer />
        </Providers>
      </body>
    </html>
  );
}
