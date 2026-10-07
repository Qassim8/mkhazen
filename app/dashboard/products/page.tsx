import { Suspense } from "react";

import PageHeader from "@/components/shared/PageHeader";

import ProductsPageClient from "./_components/ProductPageClient";
import { redirectToNewProductPage } from "./_components/RedirectFunc";

import { getProducts } from "./services/products.services";
import { getCategories } from "../categories/services/categories.services";
import { getSuppliers } from "../suppliers/services/supplier.services";

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

  const pageParam = Number(resolvedSearchParams.page);
  const limitParam = Number(resolvedSearchParams.limit);

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const limit =
    Number.isInteger(limitParam) && limitParam > 0 ? limitParam : 10;

  const search = resolvedSearchParams.search?.trim() || "";
  const sortBy = resolvedSearchParams.sortBy || "";
  const status = resolvedSearchParams.status || "";

  const [productsResponse, categoriesResponse, suppliersResponse] =
    await Promise.all([
      getProducts({
        search,
        page,
        limit,
        sortBy:
          sortBy === "createdAt-desc" ||
          sortBy === "createdAt-asc" ||
          sortBy === "name-asc" ||
          sortBy === "name-desc"
            ? sortBy
            : undefined,
        status:
          status === "instock" || status === "outstock" || status === "lowstock"
            ? status
            : undefined,
      }),
      getCategories(),
      getSuppliers(),
    ]);

  const products = productsResponse?.data ?? [];

  const meta = productsResponse?.meta ?? {
    total: 0,
    page: 1,
    limit,
    totalPages: 1,
  };

  const categories =
    "data" in (categoriesResponse ?? {})
      ? (categoriesResponse.data ?? [])
      : Array.isArray(categoriesResponse)
        ? categoriesResponse
        : [];

  const suppliers = suppliersResponse?.data ?? [];

  return (
    <ProductsPageClient
      meta={meta}
      products={products}
      categories={categories}
      suppliers={suppliers}
      header={{
        title: "المنتجات",
        subtitle: `${meta.total} منتج مسجل في النظام`,
        buttonTitle: "أضف منتج",
        redirect: redirectToNewProductPage,
      }}
    />
  );
};

export default Products;
