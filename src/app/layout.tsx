import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts are bundled from npm (@fontsource-variable) so builds never depend on downloading them.
const display = localFont({
  src: "../../node_modules/@fontsource-variable/host-grotesk/files/host-grotesk-latin-wght-normal.woff2",
  variable: "--font-host-grotesk",
  weight: "300 800",
  display: "swap",
});
const body = localFont({
  src: "../../node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2",
  variable: "--font-instrument-sans",
  weight: "400 700",
  display: "swap",
});

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
