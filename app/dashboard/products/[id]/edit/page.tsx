import { notFound } from "next/navigation";

import { getCategories } from "@/app/dashboard/categories/services/categories.services";
import { getSupplierOptions } from "@/app/dashboard/suppliers/services/supplier.services";

import EditProductForm from "../../_components/EditProductForm";
import BackLink from "@/components/shared/BackLink";

import { getProductById } from "../../services/products.services";

interface EditProductPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  const { id } = await params;

  const [productResponse, categoriesResponse, suppliersResponse] =
    await Promise.all([getProductById(id), getCategories(), getSupplierOptions()]);

  const product = productResponse?.data;

  if (!product) {
    notFound();
  }

  const categories = categoriesResponse?.data ?? [];

  const suppliers = suppliersResponse?.data ?? [];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <div className="mb-3">
            <BackLink href="/dashboard/products" label="العودة إلى المنتجات" />
          </div>
          <h1 className="text-2xl font-black text-gray-950">تعديل المنتج</h1>
          <p className="mt-1 text-sm text-gray-500">
            تحديث بيانات{" "}
            <span className="font-semibold text-gray-700">{product.name}</span>{" "}
            والأسعار والخيارات المرتبطة به.
          </p>
        </div>
      </div>

      <EditProductForm
        initialData={product}
        categories={categories}
        suppliers={suppliers}
      />
    </div>
  );
}
