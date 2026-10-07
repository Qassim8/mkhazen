import { notFound, redirect } from "next/navigation";

import { getPurchaseOrderById } from "../../services/order.services";
import { getProducts } from "@/app/dashboard/products/services/products.services";
import { getSuppliers } from "@/app/dashboard/suppliers/services/supplier.services";

import EditPurchaseOrderForm from "../../_components/EditPurchaseOrder";
import BackLink from "@/components/shared/BackLink";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPurchaseOrderPage({ params }: Props) {
  const { id } = await params;

  const [orderRes, productsRes, suppliersRes] = await Promise.all([
    getPurchaseOrderById(id).catch(() => null),
    getProducts({ limit: 100 }).catch(() => ({
      data: [],
    })),
    getSuppliers({ limit: 100 }).catch(() => ({
      data: [],
    })),
  ]);

  if (!orderRes || !orderRes.data) {
    notFound();
  }

  const order = orderRes.data;

  if (order.status !== "DRAFT") {
    redirect("/dashboard/orders");
  }

  return (
    <div dir="rtl" className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BackLink href="/dashboard/orders" label="العودة إلى طلبات الشراء" />

        <div>
          <h1 className="text-2xl font-bold text-gray-900">تعديل أمر الشراء</h1>

          <p className="mt-1 text-sm text-gray-500">
            رقم الطلب:{" "}
            <span className="font-mono font-semibold text-gray-700">
              {order.orderNumber}
            </span>
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
