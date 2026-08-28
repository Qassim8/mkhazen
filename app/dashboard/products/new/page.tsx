import Link from "next/link";
import { LuArrowRight } from "react-icons/lu";
import AddProductClient from "../_components/AddProductClient";
import { getCategories } from "../../categories/services/categories.services";
import { getSuppliers } from "../../suppliers/service/supplier.services";

export default async function AddProductPage() {
  const [categories, { data: suppliers }] = await Promise.all([
    getCategories(),
    getSuppliers(),
  ]);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <Link
            href="/dashboard/products"
            className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-(--primary-red) mb-1 transition"
          >
            <LuArrowRight className="h-4 w-4" /> العودة لقائمة المنتجات
          </Link>
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
