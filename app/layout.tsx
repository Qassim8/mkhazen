import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import Navbar from "@/components/layout/Navbar";

const inter = Inter({
  variable: "--font-lato",
  weight: ["300", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Matjrey - ERP Mini Dashboard",
  description: "A compact ERP control center for your store.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${inter.className} min-h-screen bg-gray-50 text-gray-900 antialiased`}
      >
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Navbar />
            <main className="container mt-5">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
