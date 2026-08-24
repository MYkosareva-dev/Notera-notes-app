import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

import { ToastProvider, Toaster } from "@/components/Toast";
import { copy } from "@/lib/copy";
import { themeAttribute } from "@/lib/theme";
import { getThemePreference } from "@/lib/theme.server";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: copy.app.name,
};

/**
 * `data-theme` IS THE NO-FLASH MECHANISM, and stamping it here is the whole of it.
 *
 * The attribute goes out with the first byte of the document, so the stylesheet
 * resolves the palette before anything paints — no inline script, and nothing to
 * correct after hydration. The classic dark-mode bug is the mirror image of this:
 * read the preference from web storage (which the server cannot see, by
 * construction), paint the default, then repaint in front of the user. That is why
 * the preference lives in a cookie — see lib/theme.ts.
 *
 * `undefined` renders NO attribute, which is the `system` case: with nothing
 * stamped, the `prefers-color-scheme` block in globals.css decides, so a
 * first-time visitor gets their OS theme from CSS alone.
 *
 * Async only because of `cookies()`. Nothing here is an access decision — the
 * workspace fences are `lib/notes.ts` and `app/notes/layout.tsx`, and this layout
 * deliberately holds no auth logic: it wraps `/sign-in` too.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = themeAttribute(await getThemePreference());

  return (
    <html lang="en" className={inter.variable} data-theme={theme}>
      <body className="min-h-dvh">
        <ToastProvider>
          {children}
          <Toaster />
        </ToastProvider>
      </body>
    </html>
  );
}
