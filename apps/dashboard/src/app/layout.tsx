import type { Metadata } from "next";
import { Geist_Mono, Rubik } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";

// The brand typeface. Rubik is geometric and slightly rounded where Inter is neutral and
// grotesque, so it carries more character at the same sizes. The whole app reads its size,
// weight and tracking from the --text-* scale in globals.css, which is why swapping the family
// is this one declaration rather than a sweep through every component.
const rubik = Rubik({
  variable: "--font-sans-brand",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Saverlly",
    template: "%s · Saverlly",
  },
  description: "Saverlly admin console and kiosk portal.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${rubik.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
