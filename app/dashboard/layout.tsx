import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/Sidebar";
import Navbar from "@/components/layout/Navbar";
import DashboardLayout from "@/components/ui/CheckCache";
import { getOpeningLocks } from "@/lib/system-locks";

export const metadata: Metadata = {
  title: "Matjrey - ERP Mini Dashboard",
  description: "A compact ERP control center for your store.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // روابط الإدخال الافتتاحي تختفي من القائمة الجانبية عند القفل
  const locks = await getOpeningLocks();
  const hiddenHrefs = [
    ...(locks.openingStockLocked ? ["/dashboard/inventory/opening-stock"] : []),
    ...(locks.openingBalancesLocked ? ["/dashboard/accounting/opening-balances"] : []),
  ];

  return (
    <DashboardLayout>
      <div className="md:flex min-h-screen">
        <Sidebar hiddenHrefs={hiddenHrefs} />
        <div className="flex-1 flex flex-col min-w-0">
          <Navbar />
          <main className="container mt-5">{children}</main>
        </div>
      </div>
    </DashboardLayout>
  );
}
