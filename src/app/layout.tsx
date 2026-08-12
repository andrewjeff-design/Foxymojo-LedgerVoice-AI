import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LedgerVoice AI",
  description: "Voice-first invoicing, expenses, reporting and tax-review preparation for small businesses."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
