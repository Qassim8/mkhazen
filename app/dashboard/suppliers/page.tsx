import SuppliersPageClient from "./_components/SuppliersPageClient";
import { getSuppliers } from "./service/supplier.services";

interface SuppliersPageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    page?: string;
    limit?: string;
  }>;
}

export default async function SuppliersPage({
  searchParams,
}: SuppliersPageProps) {
  const resolvedSearchParams = await searchParams;

  const page = Number(resolvedSearchParams.page) || 1;
  const limit = Number(resolvedSearchParams.limit) || 10;
  const search = resolvedSearchParams.search || "";
  const status = resolvedSearchParams.status || "";

  const response = await getSuppliers({
    search,
    status: status === "active" || status === "inactive" ? status : undefined,
    page,
    limit,
  });

  return (
    <SuppliersPageClient
      initialData={response?.data || []}
      meta={response?.meta || { total: 0, page: 1, limit: 10, totalPages: 1 }}
    />
  );
}
