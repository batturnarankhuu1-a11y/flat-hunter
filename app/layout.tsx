import type { Metadata } from 'next'
import Link from 'next/link'
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs'
import { Suspense } from 'react'
import ProButton from '@/components/ProButton'
import SiteNav from '@/components/SiteNav'
import './globals.css'

export const metadata: Metadata = {
  title: 'Flat Hunter — Улаанбаатарын орон сууц',
  description: 'Улаанбаатар хотын орон сууцны заруудыг нэг дороос харьцуул.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="mn" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          appearance={{
            variables: {
              colorPrimary: "#059669",
              colorPrimaryForeground: "#ffffff",
              colorBackground: "#ffffff",
              colorInput: "#f8fafc",
              colorInputForeground: "#102c27",
              colorForeground: "#102c27",
              colorMutedForeground: "#64748b",
              colorNeutral: "#102c27",
              colorBorder: "#e2e8f0",
              colorRing: "#059669",
              borderRadius: "0.875rem",
            },
            elements: {
              card: "rounded-2xl border border-slate-200 bg-white shadow-xl",
              headerTitle: "font-semibold tracking-tight text-slate-900",
              headerSubtitle: "text-slate-500",
              formFieldLabel: "font-medium text-slate-700",
              formFieldInput: "rounded-xl border-slate-200 bg-slate-50 text-slate-900 shadow-none focus:border-emerald-600 focus:ring-emerald-600",
              formButtonPrimary: "rounded-xl bg-emerald-600 text-white shadow-none hover:bg-emerald-700",
              socialButtonsBlockButton: "rounded-xl border-slate-200 bg-white text-slate-700 shadow-none hover:bg-slate-50",
              dividerLine: "bg-slate-200",
              dividerText: "text-slate-400",
              footerActionLink: "font-medium text-emerald-700 hover:text-emerald-800",
            },
          }}
        >
          <header className="relative z-10 border-b border-slate-100 bg-white">
            <div className="flex h-16 items-center justify-between gap-4 px-5 sm:px-8">
            <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Flat Hunter нүүр хуудас">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-lg font-bold text-white">⌂</span>
              <span className="text-base font-bold tracking-tight text-slate-900">Flat <span className="text-emerald-700">Hunter</span></span>
            </Link>
            <div className="hidden min-w-0 flex-1 md:block"><Suspense><SiteNav /></Suspense></div>
            <div className="flex shrink-0 items-center gap-3 text-sm">
            <Suspense>
              <Show when="signed-out">
                <SignInButton>
                  <button className="font-semibold text-slate-600 hover:text-slate-900">Нэвтрэх</button>
                </SignInButton>
                <SignUpButton>
                  <button className="h-10 rounded-lg bg-emerald-700 px-4 font-semibold text-white transition hover:bg-emerald-800">
                    Бүртгүүлэх
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <ProButton />
                <UserButton />
              </Show>
            </Suspense>
            </div>
            </div>
            <div className="border-t border-slate-100 px-3 py-1.5 md:hidden"><Suspense><SiteNav /></Suspense></div>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  )
}
