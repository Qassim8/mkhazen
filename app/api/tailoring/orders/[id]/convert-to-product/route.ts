import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

import { productionCompletionApiSchema } from "@/app/dashboard/tailoring/schemas/tailoring.schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ConvertResult {
  id: string;
  order_number: string;
  product_name: string;
  produced_quantity: number | string | null;
  production_total_cost: number | string | null;
  unit_cost: number | string | null;
  tailoring_cost: number | string | null;
  fabric_cost: number | string | null;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json(
        { message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." },
        { status: 500 },
      );
    }

    const user = await getSession();

    if (!user) {
      return NextResponse.json(
        { message: "يرجى تسجيل الدخول أولاً." },
        { status: 401 },
      );
    }

    const role = String(user.role).toLowerCase();

    if (role !== "admin" && role !== "cashier") {
      return NextResponse.json(
        {
          message: "تحويل طلب العميل إلى منتج متاح للكاشير أو المدير فقط.",
        },
        { status: 403 },
      );
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

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { message: "معرف طلب التفصيل مطلوب." },
        { status: 400 },
      );
    }

    // اسم الدالة يجب أن يطابق الـRPC الموجودة في migration:
    // convert_customer_tailoring_to_product
    const { data, error } = await supabaseAdmin.rpc(
      "convert_customer_tailoring_to_product",
      {
        p_branch_id: MAIN_BRANCH_ID,
        p_user_id: user.userId,
        p_order_id: id,
        p_product_payload: parsed.data,
      },
    );

    if (error) {
      console.error("convert_customer_tailoring_to_product RPC:", error);

      return NextResponse.json(
        {
          message: error.message || "تعذر تحويل طلب العميل إلى منتج.",
        },
        { status: 400 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { message: "تم تنفيذ العملية دون إرجاع بيانات التحويل." },
        { status: 500 },
      );
    }

    const result = data as ConvertResult;

    return NextResponse.json({
      message: `تم تحويل الطلب ${result.order_number} إلى المنتج ${result.product_name} وإضافته للمخزون.`,
      data: {
        ...result,
        produced_quantity: Number(result.produced_quantity ?? 0),
        production_total_cost: Number(result.production_total_cost ?? 0),
        unit_cost: Number(result.unit_cost ?? 0),
        tailoring_cost: Number(result.tailoring_cost ?? 0),
        fabric_cost: Number(result.fabric_cost ?? 0),
      },
    });
  } catch (error: unknown) {
    console.error("POST /api/tailoring/orders/[id]/convert-to-product:", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير متوقع أثناء تحويل الطلب إلى منتج.",
      },
      { status: 500 },
    );
  }
}
