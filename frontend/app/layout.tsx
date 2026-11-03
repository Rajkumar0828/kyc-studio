import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DemoBanner } from "./components/DemoBanner";
import { Logo } from "./components/Logo";
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

const TAGLINE = "AI proposes, a human decides, and every check cites its source.";

// Pages set their own "<Page> · KYCite" titles; the home page uses the default.
export const metadata: Metadata = {
  title: `KYCite · ${TAGLINE}`,
  description: TAGLINE,
  applicationName: "KYCite",
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
        <footer className="border-t border-zinc-200 bg-white/60 dark:border-zinc-800 dark:bg-navy-950/60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-6 text-sm text-zinc-600 sm:px-6 dark:text-zinc-400">
            <Logo width={20} height={20} />
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">KYCite</span>
            <span>{TAGLINE}</span>
            <span className="text-zinc-500">Synthetic demo with fictional data.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
