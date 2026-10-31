import type { Metadata } from "next";
import { Host_Grotesk, Instrument_Sans } from "next/font/google";
import "./globals.css";

const display = Host_Grotesk({ variable: "--font-host-grotesk", subsets: ["latin"], weight: ["500", "600", "700"] });
const body = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Brightloop", template: "%s · Brightloop" },
  description: "Plans, subscriptions and recurring billing in one place.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
