import type { Metadata } from "next";
import { JetBrains_Mono, Sora } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import PageTransition from "@/components/PageTransition";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
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
      <body className={`${sora.variable} ${jetbrainsMono.variable} min-h-screen font-sans`}>
        <Sidebar />
        <main className="relative min-h-screen overflow-hidden px-3 pb-28 pt-3 sm:px-5 lg:ml-72 lg:px-8 lg:py-7 lg:pb-10">
          <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(0,255,178,0.14),transparent_27%),radial-gradient(circle_at_90%_5%,rgba(255,184,77,0.12),transparent_26%),linear-gradient(135deg,#06080b_0%,#0d1117_42%,#111827_100%)]" />
          <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:56px_56px]" />
          <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-28 bg-gradient-to-b from-cyan-300/10 to-transparent" />
          <PageTransition>
            <div className="mx-auto max-w-[1540px]">{children}</div>
          </PageTransition>
        </main>
      </body>
    </html>
  );
}
