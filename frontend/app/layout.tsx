import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DemoBanner } from "./components/DemoBanner";
import { NavBar } from "./components/NavBar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KYC Studio",
  description: "Describe KYC rules in plain English; the platform builds and tests the verification flow.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow dark:focus:bg-zinc-900">
          Skip to content
        </a>
        <DemoBanner />
        <NavBar />
        <div id="main" className="flex flex-1 flex-col">{children}</div>
        <footer className="border-t border-zinc-200 dark:border-zinc-800">
          <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-zinc-500 sm:px-6">
            KYC Studio · synthetic demo with fictional data. AI proposes, a human decides.
          </p>
        </footer>
      </body>
    </html>
  );
}
