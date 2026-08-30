import TableSearchbar from "@/components/shared/TableSearchbar";
import Filters from "./_components/Filters";
import PageHeader from "@/components/shared/PageHeader";
import ProductsTable from "./_components/ProductsTable";
import Pagination from "@/components/shared/Pagination"; // تأكد من مسار المكون لديك
import { redirectToNewProductPage } from "./_components/RedirectFunc";
import { getProducts } from "./services/products.services";
import { getCategories } from "../categories/services/categories.services";
import { getSuppliers } from "../suppliers/service/supplier.services";
import { Suspense } from "react";
import ProductsPageClient from "./_components/ProductPageClient";

interface ProductsPageProps {
  searchParams: Promise<{
    search?: string;
    sortBy?: string;
    status?: string;
    page?: string;
    limit?: string;
  }>;
}

const Products = async ({ searchParams }: ProductsPageProps) => {
  const resolvedSearchParams = await searchParams;

  const page = Number(resolvedSearchParams.page) || 1;
  const limit = Number(resolvedSearchParams.limit) || 10;
  const search = resolvedSearchParams.search || "";
  const sortBy = resolvedSearchParams.sortBy || "";
  const status = resolvedSearchParams.status || "";

  const response = await getProducts({
    search,
    page,
    limit,
  });

  const products = response?.data || [];
  const meta = response?.meta || {
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  };

  const categories = await getCategories();
  const { data: suppliers } = await getSuppliers();

  return (
    <ProductsPageClient
      meta={meta}
      products={products}
      categories={categories}
      suppliers={suppliers}
    />
  );
};

export default Products;
