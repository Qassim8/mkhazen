import { Suspense } from "react";
import Link from "next/link";

import { getSession } from "@/lib/auth";
import { getTailoringOrders } from "./services/tailoring.services";
import TailoringOrdersTable from "./_components/TailoringOrdersTable";
import { supabaseAdmin } from "@/lib/supabase";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { can } from "@/lib/permissions";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TailoringOrdersPage({ searchParams }: Props) {
  const user = await getSession();

  if (!user) {
    return null;
  }

  const params = await searchParams;
  const role = String(user.role).toLowerCase();
  const canManageAll = can(role, "tailoring.manage");
  const isTailor = role === "tailor";
  const isCashier = role === "cashier";

  if (!canManageAll && !isTailor && !isCashier) {
    return null;
  }

  if (!MAIN_BRANCH_ID) {
    throw new Error("معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام.");
  }

  const purpose = first(params.purpose) as
    | "CUSTOMER"
    | "PRODUCTION"
    | undefined;
  const status = first(params.status) as
    | "NEW"
    | "UNDER_TAILORING"
    | "READY_FOR_PICKUP"
    | "RECEIVED"
    | "CANCELLED"
    | undefined;
  const paymentStatus = first(params.paymentStatus) as
    | "UNPAID"
    | "PARTIAL"
    | "PAID"
    | undefined;
  const search = first(params.search);
  const tailorId = canManageAll ? first(params.tailorId) : undefined;
  const fromDate = first(params.fromDate);
  const toDate = first(params.toDate);
  const overdue = first(params.overdue) === "true";
  const page = Math.max(1, Number(first(params.page) ?? 1) || 1);
  const limit = Math.min(
    50,
    Math.max(5, Number(first(params.limit) ?? 15) || 15),
  );

  const [{ data: orders, meta }, { data: tailorRows, error: tailorsError }] =
    await Promise.all([
      getTailoringOrders({
        status,
        purpose,
        paymentStatus,
        search,
        tailorId: isTailor ? user.userId : tailorId,
        fromDate,
        toDate,
        overdue,
        page,
        limit,
      }),
      canManageAll
        ? supabaseAdmin
            .from("users")
            .select("id, name")
            .eq("branchId", MAIN_BRANCH_ID)
            .eq("role", "tailor")
            .order("name", { ascending: true })
        : Promise.resolve({
            data: [] as { id: string; name: string }[],
            error: null,
          }),
    ]);

  if (tailorsError) {
    throw new Error(`تعذر جلب قائمة الخياطين: ${tailorsError.message}`);
  }

  return (
    <main className="">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold md:text-3xl">طلبات التفصيل</h1>
          <p className="mt-1 text-xs text-gray-500 md:text-sm">
            {canManageAll
              ? "جميع طلبات التفصيل في الفرع مع فلترة حسب الخياط والحالة."
              : isTailor
                ? "طلبات التفصيل المسندة إلى حسابك فقط."
                : "طلبات تفصيل العملاء ومتابعة جاهزيتها للتسليم."}
          </p>
        </div>

        {can(role, "tailoring.operate") && (
          <Link
            href="/dashboard/tailoring/new"
            className="inline-flex items-center justify-center rounded-xl bg-(--primary-red) px-4 py-2.5 text-xs font-bold text-white hover:opacity-90"
          >
            طلب تفصيل جديد
          </Link>
        )}
      </header>

      <Suspense
        fallback={
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm font-bold text-gray-400">
            جارٍ تحميل طلبات التفصيل...
          </div>
        }
      >
        <TailoringOrdersTable
          orders={orders}
          meta={meta}
          canManageAll={canManageAll}
          isTailor={isTailor}
          isCashier={isCashier}
          tailors={tailorRows ?? []}
        />
      </Suspense>
    </main>
  );
}
