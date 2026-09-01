import { notFound } from "next/navigation";
import Link from "next/link";
import { LuArrowRight, LuSquarePen } from "react-icons/lu";
import ProductDetailsClient from "../_components/ProductDetailsClient";
import { getProductById } from "../services/products.services";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailsPage({ params }: PageProps) {
  const { id } = await params;
  const { data: product } = await getProductById(id);

  if (!product) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 sm:p-6 lg:p-8 space-y-6 text-right dir-rtl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/products"
            className="p-2.5 rounded-2xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            title="العودة للمنتجات"
          >
            <LuArrowRight className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-black text-gray-900">{product.name}</h1>
            <p className="text-xs text-gray-400">
              معرّف المنتج:{" "}
              <span className="font-mono">{product?.variants[0]?.sku}</span>
            </p>
          </div>
        </div>

        {/* أجراءات الصفحة */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Link
            href={`/dashboard/products/${product.id}/edit`}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-(--primary-red) text-white font-semibold text-xs hover:bg-(--primary-red)/70 transition-colors"
          >
            <LuSquarePen className="h-4 w-4" />
            تعديل المنتج
          </Link>
        </div>
      </div>

      <ProductDetailsClient product={product} />
    </div>
  );
}
