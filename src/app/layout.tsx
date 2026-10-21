import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { getSession, homePath } from "@/lib/session";
import { signOut } from "./login/actions";
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
  title: "Pact Demo Wallet",
  description: "A sample web wallet showing how to integrate the Pact Labs APIs.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b">
          <nav className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
            <Link href={homePath(session)} className="mr-auto font-semibold">
              Pact Demo Wallet
            </Link>
            <Link href="/wallet" className="text-muted-foreground hover:text-foreground">
              Wallet
            </Link>
            <Link href="/inspector" className="text-muted-foreground hover:text-foreground">
              Inspector
            </Link>
            {session && (
              <form action={signOut}>
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            )}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
