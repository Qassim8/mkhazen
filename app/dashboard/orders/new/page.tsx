import { getProducts } from "../../products/services/products.services";
import { getSuppliers } from "../../suppliers/service/supplier.services";

import CreateOrderClient from "../_components/CreateOrderClient";

export const revalidate = 0;

export default async function CreatePurchaseOrderPage() {
  const [{ data: products = [] }, { data: suppliers = [] }] = await Promise.all(
    [
      /*
       * نرفع الحد حتى تكون قائمة اختيار الـVariants مفيدة.
       * الـAPI عندك يسمح بحد أقصى 100.
       */
      getProducts({
        limit: 100,
        page: 1,
      }),

      getSuppliers(),
    ],
  );

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">
          إنشاء أمر شراء جديد
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          أنشئ شراءً مباشرًا أو طلب توريد يمر بالموافقة ثم الاستلام.
        </p>
      </div>

      <CreateOrderClient products={products} suppliers={suppliers} />
    </main>
  );
}
