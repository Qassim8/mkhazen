import { notFound, redirect } from "next/navigation";
import { getPurchaseOrderById } from "../../services/order.services";
import { getProducts } from "@/app/dashboard/products/services/products.services";
import { getSuppliers } from "@/app/dashboard/suppliers/service/supplier.services";
import EditPurchaseOrderForm from "../../_components/EditPurchaseOrder";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPurchaseOrderPage({ params }: Props) {
  const { id } = await params;

  // جلب البيانات بشكل متوازي
  const [orderRes, productsRes, suppliersRes] = await Promise.all([
    getPurchaseOrderById(id).catch(() => null),
    getProducts().catch(() => ({ data: [] })),
    getSuppliers().catch(() => ({ data: [] })),
  ]);

  if (!orderRes || !orderRes.data) {
    notFound();
  }

  const order = orderRes.data;

  // منع تعديل أي طلب غير المسودة (Draft)
  if (order.status !== "DRAFT") {
    redirect(`/dashboard/orders/`);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            تعديل أمر الشراء: {order.orderNumber}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            يمكنك تعديل البيانات والمنتجات طالما أن الطلب في حالة المسودة.
          </p>
        </div>
      </div>

      <EditPurchaseOrderForm
        initialOrder={order}
        products={productsRes.data || []}
        suppliers={suppliersRes.data || []}
      />
    </div>
  );
}
