import AddProductClient from "../_components/AddProductClient";
import { getCategories } from "../../categories/services/categories.services";
import { getSupplierOptions } from "../../suppliers/services/supplier.services";
import BackLink from "@/components/shared/BackLink";

export default async function AddProductPage() {
  const [categoriesRes, suppliersRes] = await Promise.all([
    getCategories(),
    getSupplierOptions(),
  ]);

  const categories = Array.isArray(categoriesRes)
    ? categoriesRes
    : categoriesRes?.data || [];
  const suppliers = Array.isArray(suppliersRes)
    ? suppliersRes
    : suppliersRes?.data || [];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <div className="mb-3">
            <BackLink href="/dashboard/products" label="العودة إلى المنتجات" />
          </div>
          <h1 className="text-2xl font-black text-gray-950">
            إضافة منتج جديد للمخزن
          </h1>
        </div>
      </div>

      <AddProductClient
        initialCategories={categories}
        initialSuppliers={suppliers}
      />
    </div>
  );
}
