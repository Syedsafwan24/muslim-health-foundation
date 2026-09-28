import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MHF Aid", template: "%s · MHF Aid" },
  description: "Muslim Health Foundation, Bhatkal — medical aid management",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const c = await cookies();
  const density = c.get("density")?.value === "compact" ? "compact" : "comfortable";
  const theme = c.get("theme")?.value;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" data-density={density} className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <body>
        {theme === "system" && (
          <script nonce={nonce} dangerouslySetInnerHTML={{ __html: "if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')" }} />
        )}
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
