import Link from "next/link";
import { notFound } from "next/navigation";
import { LuArrowRight, LuSquarePen } from "react-icons/lu";

import ProductDetailsClient from "../_components/ProductDetailsClient";
import { getProductById } from "../services/products.services";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ProductDetailsPage({ params }: PageProps) {
  const { id } = await params;

  const response = await getProductById(id);

  const product = response?.data;

  if (!product) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50/50 p-4 text-right sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Product identity */}
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard/products"
            aria-label="العودة للمنتجات"
            title="العودة للمنتجات"
            className="shrink-0 rounded-2xl border border-gray-200 p-2.5 text-gray-600 transition-colors hover:bg-gray-50"
          >
            <LuArrowRight className="h-5 w-5" />
          </Link>

          <div className="min-w-0">
            <h1 className="truncate text-xl font-black text-gray-900">
              {product.name}
            </h1>

            <p className="mt-1 text-xs text-gray-400">
              {product.variants?.length === 1
                ? "منتج مفرد"
                : `${product.variants?.length ?? 0} خيارات للمنتج`}
            </p>
          </div>
        </div>

        {/* Actions */}
        <Link
          href={`/dashboard/products/${product.id}/edit`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-(--primary-red) px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-(--primary-red)/80 sm:w-auto"
        >
          <LuSquarePen className="h-4 w-4" />
          تعديل المنتج
        </Link>
      </div>

      <ProductDetailsClient product={product} />
    </main>
  );
}
