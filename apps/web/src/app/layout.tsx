import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";

const siteTitle = "Coffee Business Manager – Coffee Trade & Cash Flow";
const siteDescription =
  "Manage coffee trading, processing batches, warehouse inventory, fleet logs, invoices, and multi-currency cash flow in one workspace.";
const appUrl =
  process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || undefined;

export const metadata: Metadata = {
  ...(appUrl ? { metadataBase: new URL(appUrl) } : {}),
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    type: "website",
    title: siteTitle,
    description: siteDescription,
    siteName: "Coffee Business Manager",
    ...(appUrl ? { url: appUrl } : {}),
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? {
        verification: {
          google: process.env.GOOGLE_SITE_VERIFICATION,
        },
      }
    : {}),
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Coffee Business Manager",
  applicationCategory: "BusinessApplication",
  operatingSystem: "All",
  description: siteDescription,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
