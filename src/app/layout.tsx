import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fitrum | 継続最優先のAI筋トレ管理",
  description: "Fitrumは、AIがスケジュールとメニューの自動構築・スライド調整を行い、筋トレの継続を強力にサポートするモバイル特化型管理アプリです。",
  keywords: ["筋トレ", "ワークアウト", "継続", "Gemini", "AIパーソナルトレーナー", "スケジュール管理", "筋トレ記録"],
  authors: [{ name: "Fitrum Team" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Fitrum",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#07050a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        {/* iOS用のスタンドアロン表示サポートメタタグ */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
