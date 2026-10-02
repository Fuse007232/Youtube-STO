import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Shorts Live Timing",
  description: "Privates Dashboard für Bra1nrotvault und Granny Aura",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Live Timing", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#08080b",
  colorScheme: "dark",
  // Ganze Fläche nutzen (iPhone-Notch/Home-Leiste werden über env(safe-area-inset-*) freigehalten)
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
