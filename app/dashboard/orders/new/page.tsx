import { getProductOptions } from "../../products/services/products.services";
import { getSupplierOptions } from "../../suppliers/services/supplier.services";

import CreateOrderClient from "./CreateOrderClient";
import BackLink from "@/components/shared/BackLink";

export const revalidate = 0;

interface CreatePurchaseOrderPageProps {
  searchParams: Promise<{ variantId?: string | string[] }>;
}

export default async function CreatePurchaseOrderPage({
  searchParams,
}: CreatePurchaseOrderPageProps) {
  const query = await searchParams;
  const variantId = Array.isArray(query.variantId)
    ? query.variantId[0]
    : query.variantId;
  const [{ data: products = [] }, { data: suppliers = [] }] = await Promise.all(
    [
      // كل المنتجات (مش أول 100 بس) عشان أي منتج يتطلب في الشراء
      getProductOptions(),

      getSupplierOptions(),
    ],
  );

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="border-b border-gray-200 pb-4">
        <div className="mb-3">
          <BackLink href="/dashboard/orders" label="العودة إلى طلبات الشراء" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          إنشاء أمر شراء جديد
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          أنشئ شراءً مباشرًا أو طلب توريد يمر بالموافقة ثم الاستلام.
        </p>
      </div>

      <CreateOrderClient
        key={variantId ?? "new"}
        products={products}
        suppliers={suppliers}
        initialVariantId={variantId}
      />
    </main>
  );
}
