import { ThemeProvider } from "@/lib/theme/theme-provider"

export default function PrivateLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <div className="mx-auto px-0">{children}</div>
    </ThemeProvider>
  )
}
