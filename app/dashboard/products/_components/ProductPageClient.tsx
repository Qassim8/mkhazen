"use client";

import { Suspense } from "react";

import TableSearchbar from "@/components/shared/TableSearchbar";
import PageHeader from "@/components/shared/PageHeader";
import Pagination from "@/components/shared/Pagination";

import Filters from "./Filters";
import ProductsTable from "./ProductsTable";

import { Product } from "../schemas/product.schemas";
import { Category } from "../../categories/schemas/category.schemas";
import { Supplier } from "../../suppliers/schemas/supplier.schemas";

interface ProductsMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ProductsPageHeader {
  title: string;
  subtitle: string;
  buttonTitle: string;
  redirect: () => void;
}

interface ProductsPageProps {
  meta: ProductsMeta;
  products: Product[];
  categories: Category[];
  suppliers: Supplier[];
  header: ProductsPageHeader;
}

const ProductsPageClient = ({
  meta,
  products,
  categories,
  suppliers,
  header,
}: ProductsPageProps) => {
  return (
    <main>
      <PageHeader
        title={header.title}
        subtitle={header.subtitle}
        buttonTitle={header.buttonTitle}
        redirect={header.redirect}
      />

      <section className="frame p-0! my-8">
        <Suspense
          fallback={
            <div className="flex h-16 items-center gap-3 px-3 py-5 md:flex-row">
              <div className="h-10 flex-1 animate-pulse rounded-lg bg-gray-100" />
              <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-100" />
              <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-100" />
            </div>
          }
        >
          <div className="flex flex-col gap-3 px-3 py-5 md:flex-row md:items-center">
            <TableSearchbar placeholder="ابحث باسم المنتج أو SKU أو الباركود..." />

            <Filters />
          </div>
        </Suspense>

        <ProductsTable
          products={products}
          categories={categories}
          suppliers={suppliers}
        />

        <Suspense fallback={<div className="h-16 animate-pulse bg-gray-50" />}>
          <Pagination meta={meta} />
        </Suspense>
      </section>
    </main>
  );
};

export default ProductsPageClient;
