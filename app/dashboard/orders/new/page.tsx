import { getProducts } from "../../products/services/products.services";
import { getSuppliers } from "../../suppliers/service/supplier.services";
import CreateOrderClient from "../_components/CreateOrderClient";

export const revalidate = 0; // أو dynamic = 'force-dynamic' لضمان أحدث البيانات

export default async function CreatePurchaseOrderPage() {
  // جلب البيانات مباشرة على السيرفر (Parallel Data Fetching)
  const [{ data: products }, { data: suppliers }] = await Promise.all([
    getProducts(),
    getSuppliers(),
  ]);

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Header - Server Rendered */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            إنشاء أمر شراء جديد
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            قم بملء البيانات والتفاصيل المطلوبة لإنشاء أمر شراء مباشر أو كمسودة
          </p>
        </div>
      </div>

      {/* Client Form Component */}
      <CreateOrderClient products={products} suppliers={suppliers} />
    </div>
  );
}
