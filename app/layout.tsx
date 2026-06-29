import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { JetBrains_Mono, Sora } from "next/font/google";
import AppShell from "@/components/AppShell";
import { getPortfolioAuthContext } from "@/lib/auth";
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
  title: "Sam's Personal Investor",
  description: "Quant + AI research, recommendations, and performance tracking for Sam's portfolio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <LayoutContent>{children}</LayoutContent>;
}

async function LayoutContent({ children }: { children: React.ReactNode }) {
  const authContext = await getPortfolioAuthContext().catch(() => null);

  return (
    <html lang="en">
      <body className={`${sora.variable} ${jetbrainsMono.variable} min-h-screen font-sans`}>
        <ClerkProvider>
          <AppShell role={authContext?.role ?? null}>{children}</AppShell>
        </ClerkProvider>
      </body>
    </html>
  );
}
