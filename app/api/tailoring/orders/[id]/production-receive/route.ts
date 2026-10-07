import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import {
  productionCompletionApiSchema,
} from "@/app/dashboard/tailoring/schemas/tailoring.schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json({ message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." }, { status: 500 });
    }

    const user = await getSession();
    if (!user) return NextResponse.json({ message: "يرجى تسجيل الدخول أولاً." }, { status: 401 });

    const role = String(user.role).toLowerCase();
    if (role !== "admin" && role !== "cashier") {
      return NextResponse.json({ message: "استلام الإنتاج وإنشاء المنتج متاح للكاشير أو المدير فقط." }, { status: 403 });
    }

    const body = await request.json();
    const parsed = productionCompletionApiSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "بيانات المنتج غير صالحة.",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const input = parsed.data;
    const { id } = await params;
    if (!id) return NextResponse.json({ message: "معرف طلب التصنيع مطلوب." }, { status: 400 });

    const { data, error } = await supabaseAdmin.rpc("complete_tailoring_production", {
      p_branch_id: MAIN_BRANCH_ID,
      p_user_id: user.userId,
      p_order_id: id,
      p_product_payload: input,
    });

    if (error) {
      console.error("complete_tailoring_production RPC:", error);
      return NextResponse.json({ message: error.message || "تعذر استلام الإنتاج وإنشاء المنتج." }, { status: 400 });
    }

    return NextResponse.json({
      message: `تم استلام الإنتاج وإنشاء المنتج ${data.product_name} وإضافته للمخزون بنجاح.`,
      data: {
        ...data,
        produced_quantity: Number(data.produced_quantity ?? 0),
        production_total_cost: Number(data.production_total_cost ?? 0),
        unit_cost: Number(data.unit_cost ?? 0),
        tailoring_cost: Number(data.tailoring_cost ?? 0),
        fabric_cost: Number(data.fabric_cost ?? 0),
      },
    });
  } catch (error: unknown) {
    console.error("POST /api/tailoring/orders/[id]/production-receive:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "حدث خطأ غير متوقع أثناء استلام الإنتاج." }, { status: 500 });
  }
}
