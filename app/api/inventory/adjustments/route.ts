import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";

import { inventoryAdjustmentSchema } from "@/app/dashboard/inventory/schema/inventory.schemas";

export async function POST(request: Request) {
  try {
    /* =====================================================
       AUTH
    ===================================================== */

    const user = await getSession();

    if (!user || !can(user.role, "catalog.manage")) {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك",
        },
        { status: 403 },
      );
    }

    /* =====================================================
       VALIDATION
    ===================================================== */

    const body = await request.json();

    const validation = inventoryAdjustmentSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات التسوية غير صالحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const {
      variantId,
      adjustmentType,
      quantity,
      amount,
      paymentMethod,
      notes,
    } = validation.data;

    const entryNumber = `ADJ-${Date.now()}`;

    /* =====================================================
       PROCESS ATOMIC TRANSACTION
    ===================================================== */

    const { data: result, error: rpcError } = await supabaseAdmin.rpc(
      "process_inventory_adjustment",
      {
        p_variant_id: variantId,
        p_user_id: user.userId ?? null,
        p_adjustment_type: adjustmentType,

        p_quantity: Math.abs(quantity),

        p_notes: notes ?? null,

        p_entry_number: entryNumber,

        /*
            IN:
              negative amount = customer refund

            OUT:
              positive amount = supplier refund
          */
        p_amount: Number(amount.toFixed(2)),

        p_payment_method: paymentMethod ?? null,

        p_branch_id: MAIN_BRANCH_ID,
      },
    );

    if (rpcError) {
      console.error("Inventory adjustment RPC:", rpcError);

      return NextResponse.json(
        {
          message: rpcError.message || "تعذر إجراء التسوية المخزنية",
        },
        { status: 400 },
      );
    }

    /* =====================================================
       CACHE
    ===================================================== */

    revalidateTag("products-list", "default");
    revalidateTag("purchases-list", "default");

    revalidateTag("inventory-list", "default");
    revalidateTag("inventory-movements", "default");

    revalidateTag("accounting-entries", "default");
    revalidateTag("accounting-summary", "default");

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/accounting");

    /* =====================================================
       RESPONSE
    ===================================================== */

    return NextResponse.json(
      {
        message:
          adjustmentType === "IN"
            ? amount < 0
              ? "تم تسجيل مرتجع العميل وإعادة الكمية للمخزون بنجاح"
              : "تمت زيادة المخزون وتسجيل التسوية بنجاح"
            : amount > 0
              ? "تم تسجيل مرتجع المورد وخصم الكمية من المخزون بنجاح"
              : "تم خصم الكمية وتسجيل التسوية بنجاح",

        data: result,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("Inventory adjustment unexpected:", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "خطأ غير متوقع في السيرفر",
      },
      { status: 500 },
    );
  }
}
