import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist, IBM_Plex_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const ibmMono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const title = "Jev HUD";
const description =
  "Test TypeSafe Jev. Send a state, define questions, and inspect the evaluation.";

export const metadata: Metadata = {
  metadataBase: new URL("https://jevhud.vercel.app"),
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    url: "/",
    siteName: title,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og_image.png",
        width: 1731,
        height: 909,
        alt: "Jev HUD. Make AI decisions explicit.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og_image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        geist.variable,
        ibmMono.variable,
        "dark h-full font-sans antialiased",
      )}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
