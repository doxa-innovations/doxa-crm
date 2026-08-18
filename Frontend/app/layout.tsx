import type { Metadata } from "next";
import localFont from "next/font/local";
import * as React from "react";

import "@/app/globals.css";
import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: "Doxa CRM",
  description: "CRM frontend for Doxa sales, marketing, and customer success workflows.",
};

// Vendored so production builds do not depend on Google Fonts being reachable.
// Latin subset of the Inter variable font (weights 100-900); see app/fonts/OFL.txt.
const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
});

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
