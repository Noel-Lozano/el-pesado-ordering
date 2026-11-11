import type { Metadata, Viewport } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { strings } from "@/lib/strings";
import { BRAND_COLOR } from "@/lib/theme";
import "./globals.css";

// Headings and buttons. Lilita One ships a single weight.
const lilitaOne = Lilita_One({
  variable: "--font-lilita-one",
  weight: "400",
  subsets: ["latin", "latin-ext"],
});

// Body text, 400–900 (variable font).
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: strings.app.name,
  description: strings.app.description,
  // iOS ignores most of the web manifest; these make "Add to Home Screen"
  // open full-screen with the right name and icon there too.
  appleWebApp: { capable: true, title: strings.app.shortName, statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: BRAND_COLOR,
  // Lets content (the sticky cart bar) use env(safe-area-inset-*) to stay
  // clear of the iPhone home indicator. Zoom stays enabled for accessibility.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${lilitaOne.variable} ${nunito.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white font-sans text-navy">
        <AuthProvider>
          <CartProvider>{children}</CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
