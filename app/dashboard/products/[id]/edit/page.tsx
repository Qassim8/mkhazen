import { notFound } from "next/navigation";
import { getCategories } from "@/app/dashboard/categories/services/categories.services";
import { getSuppliers } from "@/app/dashboard/suppliers/service/supplier.services";
import EditProductForm from "../../_components/EditProductForm";
import { getProductById } from "../../services/products.services";

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  const { id } = await params;

  console.log(id);

  // جلب البيانات بالتوازي لتحسين الأداء
  const [{ data: product }, { data: categories }, { data: suppliers }] =
    await Promise.all([
      getProductById(id).catch(() => null),
      getCategories().catch(() => []),
      getSuppliers().catch(() => []),
    ]);

  if (!product) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">تعديل المنتج</h1>
          <p className="text-sm text-gray-500">
            تحديث بيانات المنتج الأساسية والمتغيرات الخاصة به ({product.name})
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
