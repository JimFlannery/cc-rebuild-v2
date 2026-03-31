import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { WalletProvider } from "@/components/wallet-provider";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { getMarketMetrics } from "@/app/_actions/getDashboardMetrics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ConditionCover",
  description: "Space-weather risk hedging platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const metrics = await getMarketMetrics().catch(() => null);

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground flex flex-col min-h-screen`}
      >
        <ThemeProvider>
          <WalletProvider>
            <Nav coverSupply={metrics?.coverSupply ?? 0} coverDemand={metrics?.coverDemand ?? 0} />
            <div className="flex-1">{children}</div>
            <Footer />
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
