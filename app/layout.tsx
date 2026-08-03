import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MIRROR WORD GRID",
  description: "AIパートナーと遊ぶ、イラストしりとり×○×ゲーム。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
