import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import PageTransition from "@/components/PageTransition";
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
  title: "Portfolio Manager",
  description: "Quant + AI research, recommendations, and performance tracking for Sam's portfolio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-stone-50 font-sans`}>
        <Sidebar />
        <main className="lg:ml-56 px-4 sm:px-6 py-6 min-h-screen pb-24 lg:pb-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </body>
    </html>
  );
}
