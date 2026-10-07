import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

import { getTailoringOrderById } from "../services/tailoring.services";
import NewTailoringOrderForm from "../_components/NewTailoringOrderForm";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewTailoringOrderPage({ searchParams }: Props) {
  const user = await getSession();

  if (!user) {
    redirect("/login");
  }

  const role = String(user.role).toLowerCase();

  if (role !== "admin" && role !== "cashier") {
    redirect("/dashboard/tailoring");
  }

  if (!MAIN_BRANCH_ID) {
    throw new Error("معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام.");
  }

  const params = await searchParams;
  const transferFrom = first(params.transferFrom);

  let advanceSource = null;

  if (transferFrom) {
    try {
      const { data: source } = await getTailoringOrderById(transferFrom);

      const sourceCanTransferAdvance =
        source.tailoringPurpose === "CUSTOMER" &&
        (source.tailoringStatus === "CANCELLED" ||
          source.tailoringStatus === "CONVERTED_TO_PRODUCT") &&
        Boolean(source.customer) &&
        source.customerAdvanceAvailable > 0;

      if (!sourceCanTransferAdvance || !source.customer) {
        redirect("/dashboard/tailoring");
      }

      advanceSource = {
        id: source.id,
        orderNumber: source.orderNumber,
        customerName: source.customer.name,
        customerWhatsapp: source.customer.whatsappNumber,
        measurements: source.measurements,
        tailoringItemName: source.tailoringItemName,
        tailoringItemDescription: source.tailoringItemDescription,
        expectedDeliveryDate: source.expectedDeliveryDate,
        customerAdvanceAvailable: source.customerAdvanceAvailable,
      };
    } catch {
      redirect("/dashboard/tailoring");
    }
  }

  const { data: tailors, error } = await supabaseAdmin
    .from("users")
    .select("id, name")
    .eq("branchId", MAIN_BRANCH_ID)
    .eq("role", "tailor")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`تعذر جلب قائمة الخياطين: ${error.message}`);
  }

  return (
    <NewTailoringOrderForm
      tailors={tailors ?? []}
      advanceSource={advanceSource}
    />
  );
}
