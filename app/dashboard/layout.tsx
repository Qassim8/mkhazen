import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/Sidebar";
import Navbar from "@/components/layout/Navbar";
import DashboardLayout from "@/components/ui/CheckCache";

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
    <DashboardLayout>
      <div className="md:flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Navbar />
          <main className="container mt-5">{children}</main>
        </div>
      </div>
    </DashboardLayout>
  );
}
