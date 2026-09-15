import { NextResponse } from "next/server";

import { revalidatePath, revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

import { inventoryAdjustmentSchema } from "@/app/dashboard/inventory/schema/inventory.schemas";

export async function POST(request: Request) {
  try {
    /* =====================================================
       AUTH
    ===================================================== */

    const user = await getSession();

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط",
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

    const { variantId, adjustmentType, quantity, notes } = validation.data;

    /* =====================================================
       GET CURRENT VARIANT
    ===================================================== */

    const { data: variant, error: variantError } = await supabaseAdmin
      .from("product_variants")
      .select(
        `
          id,
          "templateId",
          "stockQuantity",
          "purchasePrice",
          product_templates (
            id,
            name
          )
        `,
      )
      .eq("id", variantId)
      .single();

    if (variantError || !variant) {
      return NextResponse.json(
        {
          message: "المتغير غير موجود",
        },
        { status: 404 },
      );
    }

    const currentStock = Number(variant.stockQuantity || 0);

    /* =====================================================
       CALCULATE NEW STOCK
    ===================================================== */

    const isIncrease = adjustmentType === "IN";

    const newStock = isIncrease
      ? currentStock + quantity
      : currentStock - quantity;

    if (newStock < 0) {
      return NextResponse.json(
        {
          message: "الكمية المراد خصمها أكبر من المخزون الحالي",
        },
        { status: 400 },
      );
    }

    const movementType = isIncrease ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";

    /* =====================================================
       UPDATE STOCK
       Conditional update prevents two simultaneous
       adjustments from silently overwriting each other.
    ===================================================== */

    const { data: updatedVariant, error: updateError } = await supabaseAdmin
      .from("product_variants")
      .update({
        stockQuantity: newStock,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", variantId)
      .eq("stockQuantity", currentStock)
      .select(
        `
          id,
          "stockQuantity"
        `,
      )
      .single();

    if (updateError || !updatedVariant) {
      console.error("Inventory stock update:", updateError);

      return NextResponse.json(
        {
          message:
            "تعذر تحديث المخزون، ربما تم تغييره بواسطة مستخدم آخر. أعد المحاولة.",
        },
        { status: 409 },
      );
    }

    /* =====================================================
       RECORD MOVEMENT
    ===================================================== */

    const { error: movementError } = await supabaseAdmin
      .from("inventory_movements")
      .insert({
        template_id: variant.templateId,

        variant_id: variantId,

        movement_type: movementType,

        quantity,

        unit_cost: Number(variant.purchasePrice || 0),

        reference: "تسوية يدوية",

        notes,

        created_by: user.userId ?? null,
      });

    if (movementError) {
      console.error("Inventory movement insert:", movementError);

      /*
       * Attempt to rollback the stock update.
       * The conditional stock check ensures
       * another change is not accidentally overwritten.
       */
      await supabaseAdmin
        .from("product_variants")
        .update({
          stockQuantity: currentStock,
        })
        .eq("id", variantId)
        .eq("stockQuantity", newStock);

      return NextResponse.json(
        {
          message: "تعذر تسجيل حركة المخزون، تم إلغاء تحديث الرصيد",
        },
        { status: 500 },
      );
    }

    /* =====================================================
       CACHE
    ===================================================== */

    revalidateTag("products-list", "default");

    revalidateTag("purchases-list", "default");

    revalidatePath("/dashboard/inventory");

    revalidatePath("/dashboard/products");

    return NextResponse.json(
      {
        message: isIncrease
          ? "تمت زيادة المخزون وتسجيل الحركة بنجاح"
          : "تم خصم الكمية وتسجيل الحركة بنجاح",

        data: {
          variantId,
          previousStock: currentStock,
          quantity,
          movementType,
          newStock,
        },
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("Inventory adjustment unexpected:", error);

    return NextResponse.json(
      {
        message: "خطأ غير متوقع في السيرفر",
      },
      { status: 500 },
    );
  }
}
