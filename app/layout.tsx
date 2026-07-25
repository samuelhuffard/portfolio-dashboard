import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import AppShell from "@/components/AppShell";
import { getPortfolioAuthContext } from "@/lib/auth";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

// Carries the 26px monogram only.
const ibmPlexSerif = IBM_Plex_Serif({
  variable: "--font-ibm-plex-serif",
  weight: ["500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portfolio Manager",
  description: "Private wealth office — holdings, capital accounts, research desks and approvals.",
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
      <body
        className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${ibmPlexSerif.variable} min-h-screen font-sans`}
      >
        <ClerkProvider>
          <AppShell role={authContext?.role ?? null}>{children}</AppShell>
        </ClerkProvider>
      </body>
    </html>
  );
}
