import type { Metadata } from "next";
import "./globals.css";
import FeedbackChatClient from './feedback-chat-client';

export const metadata: Metadata = {
  title: "addnewfeature",
  description: "AI feedback widget SaaS — every app ships with smart issue reporting",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        {children}
        <FeedbackChatClient />
      </body>
    </html>
  );
}
