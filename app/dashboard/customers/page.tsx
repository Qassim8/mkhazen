import Link from "next/link";
import { redirect } from "next/navigation";
import { LuPhone, LuRuler, LuScissors, LuUserRound } from "react-icons/lu";

import Pagination from "@/components/shared/Pagination";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCustomers } from "./services/customers.services";

interface Props {
  searchParams: Promise<{
    search?: string;
    page?: string;
  }>;
}

export default async function CustomersPage({ searchParams }: Props) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "tailoring.operate")) redirect("/dashboard/tailoring");

  const params = await searchParams;
  const search = (params.search ?? "").trim();
  const pageNumber = Number(params.page);
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const { data: customers, meta } = await getCustomers({
    search,
    page,
    limit: 12,
    includeOrderCounts: true,
  });

  return (
    <main dir="rtl" className="space-y-5 pb-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-950">العملاء</h1>
          <p className="mt-1 text-sm text-gray-500">
            بيانات العملاء ومقاساتهم وعدد طلباتهم المسجلة.
          </p>
        </div>
        <Link
          href="/dashboard/tailoring/new"
          className="inline-flex items-center justify-center rounded-xl bg-(--primary-red) px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          إنشاء طلب تفصيل
        </Link>
      </header>

      <form
        action="/dashboard/customers"
        method="get"
        role="search"
        className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row"
      >
        <input
          name="search"
          type="search"
          defaultValue={search}
          placeholder="ابحث باسم العميل أو رقم واتساب..."
          aria-label="ابحث عن عميل"
          className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-(--primary-red) focus:bg-white"
        />
        <button
          type="submit"
          className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-bold text-white"
        >
          بحث
        </button>
      </form>

      {customers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm font-semibold text-gray-500">
          {search ? "لا يوجد عملاء يطابقون البحث." : "لا يوجد عملاء مسجلون بعد."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {customers.map((customer) => (
            <article
              key={customer.id}
              className="flex min-h-64 flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-(--primary-red)">
                  <LuUserRound className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-black text-gray-900">
                    {customer.name}
                  </h2>
                  <a
                    href={`https://wa.me/${customer.whatsappNumber.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline"
                    dir="ltr"
                  >
                    <LuPhone className="h-4 w-4" />
                    {customer.whatsappNumber}
                  </a>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-sm">
                <LuScissors className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600">الطلبات</span>
                <strong className="mr-auto text-gray-900">
                  {customer.orderCount}
                </strong>
              </div>

              <div className="mt-4 flex-1">
                <p className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
                  <LuRuler className="h-3.5 w-3.5" />
                  المقاسات المحفوظة
                </p>
                {customer.measurements.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {customer.measurements.slice(0, 6).map((measurement) => (
                      <span
                        key={measurement.label}
                        className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800"
                      >
                        {measurement.label}: {measurement.value}{" "}
                        {measurement.unit === "CM" ? "سم" : "م"}
                      </span>
                    ))}
                    {customer.measurements.length > 6 && (
                      <span className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] text-gray-500">
                        +{customer.measurements.length - 6}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-400">
                    لا توجد مقاسات محفوظة.
                  </p>
                )}
              </div>

              <Link
                href={`/dashboard/tailoring/new?customerId=${encodeURIComponent(customer.id)}`}
                className="mt-5 inline-flex items-center justify-center rounded-xl border border-(--primary-red)/30 bg-rose-50 px-3 py-2.5 text-xs font-bold text-(--primary-red) hover:bg-rose-100"
              >
                إنشاء طلب بهذا العميل
              </Link>
            </article>
          ))}
        </div>
      )}

      <Pagination meta={meta} />
    </main>
  );
}
