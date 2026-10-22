import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

import AssetsClient from "../_components/AssetsClient";
import CashierAssetEntry from "../_components/CashierAssetEntry";

import { getAssets } from "../services/accounting.services";

interface AssetsPageProps {
  searchParams: Promise<{
    search?: string;
    category?: string;
    page?: string;
    limit?: string;
  }>;
}

const AssetsPage = async ({ searchParams }: AssetsPageProps) => {
  const params = await searchParams;
  const session = await getSession();

  // من لا يملك accounting.view (الكاشير) يسجّل أصلًا جديدًا فقط بدون رؤية القائمة
  if (!can(session?.role, "accounting.view")) {
    return <CashierAssetEntry />;
  }

  const { data, meta, totalValue } = await getAssets({
    search: params.search,
    category: params.category,
    page: Number(params.page) || 1,
    limit: Number(params.limit) || 20,
  });

  return (
    <AssetsClient initialData={data} meta={meta} totalValue={totalValue} />
  );
};

export default AssetsPage;
