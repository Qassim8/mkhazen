import { redirect, notFound } from "next/navigation";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { getTailoringOrderById } from "../services/tailoring.services";
import TailoringOrderDetail from "../_components/TailoringOrderDetail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TailoringOrderDetailPage({ params }: Props) {
  const user = await getSession();
  if (!user) redirect("/login");

  const role = String(user.role).toLowerCase();
  if (!["admin", "cashier", "tailor"].includes(role)) redirect("/dashboard/tailoring");
  if (!MAIN_BRANCH_ID) throw new Error("معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام.");

  const { id } = await params;
  let data;
  try {
    ({ data } = await getTailoringOrderById(id));
  } catch {
    notFound();
  }

  const { data: categories, error: categoriesError } = await supabaseAdmin
    .from("categories")
    .select("id, name")
    .order("name", { ascending: true });

  if (categoriesError) {
    throw new Error(`تعذر جلب تصنيفات المنتجات: ${categoriesError.message}`);
  }

  return (
    <TailoringOrderDetail
      order={data}
      canManageAll={role === "admin" || role === "cashier"}
      canManageStatus={role === "admin" || role === "cashier" || data.tailorId === user.userId}
      categories={categories ?? []}
    />
  );
}
