"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { LuEye, LuFactory, LuSearch, LuShoppingBag } from "react-icons/lu";

import Table from "@/components/shared/Table";
import Pagination from "@/components/shared/Pagination";
import { ResetFilters } from "@/components/shared/ResetFilters";
import type { TailoringOrder } from "../schemas/tailoring.schemas";

interface TailorOption {
  id: string;
  name: string;
}
interface Props {
  orders: TailoringOrder[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  canManageAll: boolean;
  isTailor: boolean;
  isCashier: boolean;
  tailors: TailorOption[];
}

const columnHelper = createColumnHelper<TailoringOrder>();

const statusLabels: Record<TailoringOrder["tailoringStatus"], string> = {
  NEW: "طلب جديد",
  UNDER_TAILORING: "تحت التفصيل",
  READY_FOR_PICKUP: "جاهز",
  RECEIVED: "مكتمل",
  CANCELLED: "ملغي",
  CONVERTED_TO_PRODUCT: "تم التحويل إلى منتج",
};

const statusClasses: Record<TailoringOrder["tailoringStatus"], string> = {
  NEW: "bg-gray-100 text-gray-700",
  UNDER_TAILORING: "bg-amber-50 text-amber-700",
  READY_FOR_PICKUP: "bg-blue-50 text-blue-700",
  RECEIVED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
  CONVERTED_TO_PRODUCT: "bg-violet-50 text-violet-700",
};

function money(value: number) {
  return `${value.toFixed(2)} ج.س`;
}
function todayInSudan() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Khartoum" }).format(
    new Date(),
  );
}
function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

export default function TailoringOrdersTable({
  orders,
  meta,
  canManageAll,
  isTailor,
  isCashier,
  tailors,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    if (updates.page === undefined) params.set("page", "1");
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }
  const columns = [
    columnHelper.display({
      id: "order",
      header: "الطلب",
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          <p className="font-black text-gray-900">{row.original.orderNumber}</p>
          <p className="mt-1 text-[11px] text-gray-400">
            {formatDate(row.original.intakeDate)}
          </p>
        </div>
      ),
    }),
    columnHelper.display({
      id: "purpose",
      header: "الغرض",
      cell: ({ row }) => {
        const isProduction = row.original.tailoringPurpose === "PRODUCTION";
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${isProduction ? "bg-slate-100 text-slate-700" : "bg-red-50 text-red-700"}`}
          >
            {isProduction ? (
              <LuFactory className="h-3.5 w-3.5" />
            ) : (
              <LuShoppingBag className="h-3.5 w-3.5" />
            )}
            {isProduction ? "تصنيع للمخزون" : "تفصيل عميل"}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: "customer",
      header: "العميل / المنتج",
      cell: ({ row }) => {
        const order = row.original;
        return order.tailoringPurpose === "PRODUCTION" ? (
          <div>
            <p className="font-bold text-gray-900">
              {order.producedProduct?.name ?? "منتج لم يُنشأ بعد"}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              {order.producedQuantity
                ? `${order.producedQuantity} قطعة`
                : "بانتظار الإنتاج"}
            </p>
          </div>
        ) : (
          <div>
            <p className="font-bold text-gray-900">
              {order.customer?.name ?? "-"}
            </p>
            {(canManageAll || isCashier) && (
              <p className="mt-1 text-[11px] text-emerald-700">
                {order.customer?.whatsappNumber ?? "-"}
              </p>
            )}
          </div>
        );
      },
    }),
    ...(canManageAll
      ? [
          columnHelper.display({
            id: "tailor",
            header: "الخياط",
            cell: ({ row }) => row.original.tailorName ?? "-",
          }),
        ]
      : []),
    columnHelper.display({
      id: "delivery",
      header: "التسليم",
      cell: ({ row }) => {
        const overdue =
          row.original.tailoringStatus !== "RECEIVED" &&
          row.original.tailoringStatus !== "CANCELLED" &&
          row.original.expectedDeliveryDate < todayInSudan();
        return (
          <div className="whitespace-nowrap">
            <p
              className={`font-bold ${overdue ? "text-red-600" : "text-gray-800"}`}
            >
              {formatDate(row.original.expectedDeliveryDate)}
            </p>
            {overdue && (
              <p className="mt-1 text-[10px] font-bold text-red-500">متأخر</p>
            )}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "status",
      header: "الحالة",
      cell: ({ row }) => {
        const order = row.original;
        const isProduction = order.tailoringPurpose === "PRODUCTION";
        return (
          <span
            className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${statusClasses[order.tailoringStatus]}`}
          >
            {isProduction && order.tailoringStatus === "READY_FOR_PICKUP"
              ? "جاهز للإنتاج"
              : statusLabels[order.tailoringStatus]}
          </span>
        );
      },
    }),
    ...(!isTailor
      ? [
          columnHelper.display({
      id: "amount",
      header: "القيمة",
      cell: ({ row }) => (
        <span className="whitespace-nowrap font-bold text-gray-800">
          {row.original.tailoringPurpose === "PRODUCTION"
            ? `${row.original.totalCost.toFixed(2)} $` // تصنيع: تكلفة بالدولار
            : money(row.original.totalAmount)}
        </span>
      ),
          }),
        ]
      : []),
    columnHelper.display({
      id: "actions",
      header: "إجراء",
      cell: ({ row }) => (
        <Link
          href={`/dashboard/tailoring/${row.original.id}`}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
        >
          <LuEye className="h-3.5 w-3.5" /> التفاصيل
        </Link>
      ),
    }),
  ];

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_170px_170px_170px_170px]">
          <form
            key={searchParams.get("search") ?? ""}
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const search = String(formData.get("search") ?? "").trim();
              updateParams({ search: search || null });
            }}
            className="relative flex"
          >
            <LuSearch className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              name="search"
              defaultValue={searchParams.get("search") ?? ""}
              placeholder="بحث برقم الطلب أو اسم العمل أو العميل أو الواتساب..."
              className="w-full rounded-r-xl rounded-l-none border border-gray-300 bg-gray-50 py-2.5 pr-10 pl-3 text-sm outline-none focus:border-(--primary-red) focus:bg-white"
            />
            <button
              type="submit"
              className="shrink-0 rounded-l-xl rounded-r-none bg-(--primary-red) px-3 text-xs font-bold text-white hover:opacity-90"
            >
              بحث
            </button>
          </form>
          {canManageAll && <select
            value={searchParams.get("purpose") ?? ""}
            onChange={(event) =>
              updateParams({ purpose: event.target.value || null })
            }
            className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-(--primary-red)"
          >
            <option value="">كل أنواع الطلبات</option>
            <option value="CUSTOMER">تفصيل عميل</option>
            <option value="PRODUCTION">تصنيع للمخزون</option>
          </select>}
          <select
            value={searchParams.get("status") ?? ""}
            onChange={(event) =>
              updateParams({ status: event.target.value || null })
            }
            className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-(--primary-red)"
          >
            <option value="">كل الحالات</option>
            <option value="NEW">طلب جديد</option>
            <option value="UNDER_TAILORING">تحت التفصيل</option>
            <option value="READY_FOR_PICKUP">جاهز</option>
            <option value="RECEIVED">مكتمل</option>
            <option value="CANCELLED">ملغي</option>
          </select>
          {canManageAll ? (
            <select
              value={searchParams.get("tailorId") ?? ""}
              onChange={(event) =>
                updateParams({ tailorId: event.target.value || null })
              }
              className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-(--primary-red)"
            >
              <option value="">كل الخياطين</option>
              {tailors.map((tailor) => (
                <option key={tailor.id} value={tailor.id}>
                  {tailor.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={searchParams.get("overdue") ?? ""}
              onChange={(event) =>
                updateParams({ overdue: event.target.value || null })
              }
              className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-(--primary-red)"
            >
              <option value="">كل الطلبات</option>
              <option value="true">المتأخرة فقط</option>
            </select>
          )}
          {canManageAll && <select
            value={searchParams.get("paymentStatus") ?? ""}
            onChange={(event) =>
              updateParams({ paymentStatus: event.target.value || null })
            }
            className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-(--primary-red)"
          >
            <option value="">كل حالات الدفع</option>
            <option value="PARTIAL">عربون 50%</option>
            <option value="PAID">مسدد بالكامل</option>
            <option value="UNPAID">غير مدفوع</option>
          </select>}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={searchParams.get("fromDate") ?? ""}
            onChange={(event) =>
              updateParams({ fromDate: event.target.value || null })
            }
            className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs outline-none focus:border-(--primary-red)"
          />
          <input
            type="date"
            value={searchParams.get("toDate") ?? ""}
            onChange={(event) =>
              updateParams({ toDate: event.target.value || null })
            }
            className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs outline-none focus:border-(--primary-red)"
          />
          {canManageAll && (
            <label className="flex items-center gap-2 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-600">
              <input
                type="checkbox"
                checked={searchParams.get("overdue") === "true"}
                onChange={(event) =>
                  updateParams({
                    overdue: event.target.checked ? "true" : null,
                  })
                }
              />{" "}
              المتأخرة فقط
            </label>
          )}
          <ResetFilters />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <Table
          columns={columns}
          data={orders}
          emptyMessage="لا توجد طلبات تفصيل مطابقة للفلاتر الحالية."
          tableClassName="min-w-[1320px]"
        />
        <Pagination meta={meta} />
      </div>
    </div>
  );
}
