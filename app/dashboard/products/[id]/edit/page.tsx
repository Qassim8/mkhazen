import { notFound } from "next/navigation";

import { getCategories } from "@/app/dashboard/categories/services/categories.services";
import { getSuppliers } from "@/app/dashboard/suppliers/services/supplier.services";

import EditProductForm from "../../_components/EditProductForm";

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
    await Promise.all([getProductById(id), getCategories(), getSuppliers()]);

  const product = productResponse?.data;

  if (!product) {
    notFound();
  }

  const categories = categoriesResponse?.data ?? [];

  const suppliers = suppliersResponse?.data ?? [];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="border-b border-gray-100 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">تعديل المنتج</h1>

        <p className="mt-1 text-sm text-gray-500">
          تحديث بيانات{" "}
          <span className="font-semibold text-gray-700">{product.name}</span>{" "}
          والأسعار والخيارات المرتبطة به.
        </p>
      </div>

      <EditProductForm
        initialData={product}
        categories={categories}
        suppliers={suppliers}
      />
    </main>
  );
}
