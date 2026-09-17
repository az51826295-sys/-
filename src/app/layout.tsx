import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rookery",
  // Paddle 심사(09-14, 5번째 거절 "not a digital product or service"): "Hire AI employees" 가 사람 고용 서비스로 읽힐 수 있다 → 소프트웨어라고 말한다.
  description: "AI software (SaaS) that turns requests into finished digital work — research, documents, small web apps and short explainer videos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
