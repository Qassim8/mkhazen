import { notFound, redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { getTailoringOrderById } from "../../services/tailoring.services";
import EditTailoringOrderForm from "../../_components/EditTailoringOrderForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditTailoringOrderPage({ params }: Props) {
  const user = await getSession();
  if (!user) redirect("/login");

  const role = String(user.role).toLowerCase();
  if (role !== "admin" && role !== "cashier") redirect("/dashboard/tailoring");
  if (!MAIN_BRANCH_ID) throw new Error("معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام.");

  const { id } = await params;

  let order;
  try {
    ({ data: order } = await getTailoringOrderById(id));
  } catch {
    notFound();
  }

  if (order.tailoringStatus !== "NEW") {
    redirect(`/dashboard/tailoring/${order.id}`);
  }

  const { data: tailors, error } = await supabaseAdmin
    .from("users")
    .select("id, name")
    .eq("branchId", MAIN_BRANCH_ID)
    .eq("role", "tailor")
    .order("name", { ascending: true });

  if (error) throw new Error(`تعذر جلب قائمة الخياطين: ${error.message}`);

  return <EditTailoringOrderForm order={order} tailors={tailors ?? []} />;
}
