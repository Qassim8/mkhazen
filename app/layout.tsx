import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import GlobalModalContainer from "@/components/ui/GlobalModalContainer";

const ibm = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm-plex-sans-arabic",
  weight: ["300", "400", "500", "600"],
  subsets: ["arabic"],
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
    <html lang="ar" dir="rtl">
      <body
        className={`${ibm.className} min-h-screen bg-gray-50 text-gray-900 antialiased`}
      >
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 2500,
            style: {
              borderRadius: "16px",
              background: "#1e293b",
              color: "#fff",
              fontSize: "14px",
            },
          }}
        />
        <GlobalModalContainer />
        {children}
      </body>
    </html>
  );
}
