import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getPurchaseOrderById } from "../../services/order.services";
import { getProducts } from "@/app/dashboard/products/services/products.services";
import { getSuppliers } from "@/app/dashboard/suppliers/services/supplier.services";

import EditPurchaseOrderForm from "../../_components/EditPurchaseOrder";

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
        <Link
          href="/dashboard/orders"
          aria-label="العودة إلى طلبات الشراء"
          title="العودة إلى طلبات الشراء"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 rotate-180"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>

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
