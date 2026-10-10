import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/permissions-server";

import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { notifyTailoringUpdate } from "@/app/api/tailoring/_lib/notify";
import { updateTailoringOrderApiSchema } from "@/app/dashboard/tailoring/schemas/tailoring.schemas";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json({ message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." }, { status: 500 });
    }

    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;
    if (!user) return NextResponse.json({ message: "يرجى تسجيل الدخول أولاً.", code: "UNAUTHENTICATED" }, { status: 401 });

    const role = String(user.role).toLowerCase();
    if (!can(role, "tailoring.manage")) {
      return NextResponse.json({ message: "تعديل طلبات التفصيل متاح للمدير أو المالك فقط.", code: "FORBIDDEN" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateTailoringOrderApiSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "بيانات تعديل طلب التفصيل غير صالحة.", errors: parsed.error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    const { id } = await params;
    if (!id) return NextResponse.json({ message: "معرف طلب التفصيل مطلوب." }, { status: 400 });

    const value = parsed.data;
    const { data, error } = await supabaseAdmin.rpc("update_tailoring_order", {
      p_order_id: id,
      p_branch_id: MAIN_BRANCH_ID,
      p_user_id: user.userId,
      p_tailoring_item_name: value.tailoringItemName,
      p_tailoring_item_description: value.tailoringItemDescription,
      p_tailor_id: value.tailorId,
      p_customer_name: value.customerName,
      p_customer_whatsapp: value.customerWhatsapp,
      p_measurements: value.measurements,
      p_intake_date: value.intakeDate,
      p_expected_delivery_date: value.expectedDeliveryDate,
      p_fabric_variant_id: value.fabricVariantId,
      p_fabric_quantity: value.fabricQuantity,
      p_total_amount: value.totalAmount,
      p_tailoring_cost: value.tailoringCost,
      p_notes: value.notes,
    });

    if (error) {
      console.error("update_tailoring_order RPC:", error);
      return NextResponse.json({ message: error.message || "تعذر تعديل طلب التفصيل." }, { status: 400 });
    }

    await notifyTailoringUpdate({ orderId: id, event: "EDITED", actor: user });

    return NextResponse.json({ message: `تم تعديل الطلب ${data.order_number} بنجاح.`, data });
  } catch (error: unknown) {
    console.error("PATCH /api/tailoring/orders/[id]/edit:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "حدث خطأ غير متوقع أثناء تعديل الطلب." }, { status: 500 });
  }
}
