import type { Metadata } from "next";

// The page is a client component, so its title lives here.
export const metadata: Metadata = { title: "Developer tool · KYCite" };

export default function VerifyLayout({ children }: LayoutProps<"/verify">) {
  return children;
}
