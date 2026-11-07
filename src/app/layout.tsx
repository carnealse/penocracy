import type { Metadata } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const sans = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif" });
const manuscript = localFont({ src: "../../assets/fonts/CourierPrime-Regular.ttf", variable: "--font-manuscript" });

export const metadata: Metadata = {
  title: "Penocracy",
  description: "A private manuscript studio for writing, revising, and exporting a book.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("penocracy-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className={`${sans.variable} ${serif.variable} ${manuscript.variable}`}>{children}</body>
    </html>
  );
}
