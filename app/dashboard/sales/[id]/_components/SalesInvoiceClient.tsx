"use client";

import BackLink from "@/components/shared/BackLink";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  LuBanknote,
  LuScissors,
  LuShoppingBag,
} from "react-icons/lu";
import {
  getSalesOrderById,
  type SalesOrderDetail,
} from "@/app/dashboard/pos/services/pos.services";
import { formatProductSize } from "@/app/dashboard/products/utils/product-size";

function money(value: number) {
  return `${value.toLocaleString("ar-SA-u-nu-latn", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ج.س`; // مبالغ الزبون بالجنيه
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: "Africa/Khartoum",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function paymentMethodLabel(value: string) {
  if (value === "CASH") return "الخزينة";
  if (value === "CARD") return "بطاقة";
  if (value === "BANK_TRANSFER") return "تحويل بنكي";
  if (value === "MIXED") return "دفع مختلط";
  return value;
}

export default function SalesInvoiceClient({ orderId }: { orderId: string }) {
  const [sale, setSale] = useState<SalesOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      try {
        setSale(await getSalesOrderById(orderId));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "تعذر تحميل بيانات البيع",
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [orderId]);

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500">جارٍ تحميل الفاتورة...</div>
    );
  }

  if (!sale) {
    return (
      <div className="p-6 text-sm text-red-600">
        تعذر العثور على عملية البيع.
      </div>
    );
  }

  const isTailoring = sale.orderType === "TAILORING";

  return (
    <div dir="rtl" className="space-y-5 p-4 pb-16 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <BackLink href="/dashboard/sales" label="العودة إلى المبيعات" />

        {/* <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white"
        >
          <LuPrinter className="h-4 w-4" />
          طباعة الفاتورة
        </button> */}
      </div>

      <main className="overflow-hidden rounded-2xl border border-gray-200 bg-white print:rounded-none print:border-0 print:shadow-none">
        <header className="border-b border-gray-200 px-6 py-7 md:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900 text-white">
                  {isTailoring ? (
                    <LuScissors className="h-5 w-5" />
                  ) : (
                    <LuShoppingBag className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400">
                    {isTailoring ? "طلب تفصيل مكتمل" : "بيع من الكاشير"}
                  </p>
                  <h1 className="text-2xl font-black text-gray-950">
                    {sale.orderNumber}
                  </h1>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                تاريخ البيع: {formatDate(sale.completedAt ?? sale.createdAt)}
              </p>
            </div>

            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-center">
              <p className="text-[11px] font-bold text-emerald-600">
                إجمالي البيع
              </p>
              <p className="mt-1 text-xl font-black text-emerald-700">
                {money(sale.totalAmount)}
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 border-b border-gray-100 px-6 py-5 md:grid-cols-3 md:px-8">
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-[11px] font-bold text-gray-400">العميل</p>
            <p className="mt-1 font-black text-gray-900">
              {sale.customer?.name ?? "بيع مباشر"}
            </p>
            {sale.customer?.whatsappNumber && (
              <p className="mt-1 text-xs text-gray-500" dir="ltr">
                {sale.customer.whatsappNumber}
              </p>
            )}
          </div>

          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-[11px] font-bold text-gray-400">الكاشير</p>
            <p className="mt-1 font-black text-gray-900">
              {sale.cashier?.name ?? "-"}
            </p>
          </div>

          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-[11px] font-bold text-gray-400">طريقة الدفع</p>
            <p className="mt-1 font-black text-gray-900">
              {paymentMethodLabel(sale.paymentMethod)}
            </p>
            <p className="mt-1 text-xs font-bold text-emerald-600">
              {sale.paymentStatus === "PAID"
                ? "مدفوع بالكامل"
                : sale.paymentStatus === "PARTIAL"
                  ? "مدفوع جزئيًا"
                  : "غير مدفوع"}
            </p>
          </div>
        </section>

        {isTailoring && (
          <section className="grid gap-4 border-b border-gray-100 px-6 py-5 md:grid-cols-3 md:px-8">
            <div>
              <p className="text-xs font-bold text-gray-400">الخياط</p>
              <p className="mt-1 font-black text-gray-900">
                {sale.tailor?.name ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400">
                تاريخ استلام الطلب
              </p>
              <p className="mt-1 font-black text-gray-900">
                {sale.intakeDate ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400">
                موعد التسليم المتوقع
              </p>
              <p className="mt-1 font-black text-gray-900">
                {sale.expectedDeliveryDate ?? "-"}
              </p>
            </div>
          </section>
        )}

        <section className="px-6 py-5 md:px-8">
          <h2 className="mb-3 text-sm font-black text-gray-900">
            تفاصيل البيع
          </h2>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-162.5 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">
                    المنتج / الخدمة
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">
                    الكمية
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">
                    سعر الوحدة
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500">
                    الإجمالي
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sale.items.length > 0 ? (
                  sale.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <p className="font-bold text-gray-900">
                          {item.product.name || "منتج"}
                        </p>
                        {(item.product.sku ||
                          item.product.colorName ||
                          formatProductSize(item.product.size)) && (
                          <p className="mt-1 text-[11px] text-gray-400">
                            {[
                              item.product.sku,
                              item.product.colorName,
                              formatProductSize(item.product.size),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {money(item.unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-left font-black text-gray-900">
                        {money(item.totalPrice)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-5 font-bold text-gray-900">
                      طلب تفصيل مكتمل
                    </td>
                    <td className="px-4 py-5 text-gray-700">1</td>
                    <td className="px-4 py-5 text-gray-700">
                      {money(sale.totalAmount)}
                    </td>
                    <td className="px-4 py-5 text-left font-black text-gray-900">
                      {money(sale.totalAmount)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-t border-gray-100 px-6 py-5 md:px-8">
          <div className="mb-3 flex items-center gap-2">
            <LuBanknote className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-black text-gray-900">
              الدفعات المسجلة
            </h2>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-175 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">
                    التاريخ
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">
                    المبلغ
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">
                    الطريقة
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">
                    المسجل
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sale.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(payment.paymentDate)}
                    </td>
                    <td className="px-4 py-3 font-black">
                      {money(payment.amount)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {paymentMethodLabel(payment.paymentMethod)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {payment.createdByName ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {sale.notes && (
          <section className="border-t border-gray-100 px-6 py-5 md:px-8">
            <p className="text-xs font-bold text-gray-400">ملاحظات</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
              {sale.notes}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
