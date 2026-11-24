import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/lib/query/provider"
import { cn } from "@/lib/utils"
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignInButton,
  SignOutButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs"
import { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"
import Link from "next/link"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "Studio",
  description: "Minimal Studio test UI",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        <ClerkProvider>
          <QueryProvider>
            <ThemeProvider>
              <header className="flex h-14 items-center justify-between gap-4 border-b px-4">
                <Link href="/" className="text-sm font-semibold tracking-tight">
                  Studio
                </Link>
                <div className="flex items-center gap-3">
                  <SignedOut>
                    <SignInButton />
                    <SignUpButton>
                      <button className="bg-foreground text-background h-9 cursor-pointer rounded-md px-3 text-sm font-medium">
                        Sign Up
                      </button>
                    </SignUpButton>
                  </SignedOut>
                  <SignedIn>
                    <UserButton />
                    <SignOutButton />
                  </SignedIn>
                </div>
              </header>
              {children}
            </ThemeProvider>
          </QueryProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
