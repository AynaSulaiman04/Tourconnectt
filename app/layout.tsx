import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tour ConnecTT",
  description: "Tourism operations and traveler experience platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-on-background">{children}</body>
    </html>
  );
}
