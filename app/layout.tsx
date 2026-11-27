import type { Metadata } from 'next'
import Link from 'next/link'
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs'
import { Suspense } from 'react'
import ProButton from '@/components/ProButton'
import SiteNav from '@/components/SiteNav'
import ChatWidget from '@/components/ChatWidget'
import PreferenceToggles from '@/components/PreferenceToggles'
import T from '@/components/T'
import { PREFERENCES_SCRIPT } from '@/lib/i18n'
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
    // lang and data-theme are set from localStorage by the inline script before the first paint.
    <html lang="mn" data-theme="light" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          appearance={{
            variables: {
              colorPrimary: "#059669",
              colorPrimaryForeground: "#ffffff",
              // CSS variables from globals.css, so Clerk's cards and menus follow the dark mode switch.
              colorBackground: "var(--clerk-background)",
              colorInput: "var(--clerk-input)",
              colorInputForeground: "var(--clerk-foreground)",
              colorForeground: "var(--clerk-foreground)",
              colorMutedForeground: "var(--clerk-muted)",
              colorNeutral: "var(--clerk-foreground)",
              colorBorder: "var(--clerk-border)",
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
            <PreferenceToggles />
            <Suspense>
              <Show when="signed-out">
                <SignInButton>
                  <button className="font-semibold text-slate-600 hover:text-slate-900"><T mn="Нэвтрэх" en="Sign in" /></button>
                </SignInButton>
                <SignUpButton>
                  <button className="hidden h-10 rounded-lg bg-emerald-700 px-4 sm:block font-semibold text-white transition hover:bg-emerald-800">
                    <T mn="Бүртгүүлэх" en="Sign up" />
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
          <ChatWidget />
        </ClerkProvider>
      </body>
    </html>
  )
}
