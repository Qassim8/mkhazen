import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { inventoryAdjustmentSchema } from "@/app/dashboard/inventory/schema/inventory.schemas";

export async function POST(request: Request) {
  try {
    const user = await getSession();
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط" },
        { status: 403 },
      );
    }

    const body = await request.json();

    // استخدام الـ Schema المفصولة
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

    const { productId, adjustmentType, quantity, notes } = validation.data;

    // 1. جلب كمية المنتج الحالية
    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, stockQuantity")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { message: "المنتج غير موجود" },
        { status: 404 },
      );
    }

    const currentStock = Number(product.stockQuantity || 0);
    const changeQty = adjustmentType === "IN" ? quantity : -quantity;
    const newStock = currentStock + changeQty;

    if (newStock < 0) {
      return NextResponse.json(
        { message: "الكمية المراد خصمها أكبر من المخزون الحالي المتوفر" },
        { status: 400 },
      );
    }

    // 2. تحديث رصيد المنتج في جدول products
    const { error: updateError } = await supabaseAdmin
      .from("products")
      .update({
        stockQuantity: newStock,
      })
      .eq("id", productId);

    if (updateError) {
      return NextResponse.json(
        { message: updateError.message },
        { status: 400 },
      );
    }

    // 3. تسجيل حركة التسوية في inventory_movements
    const { error: movementError } = await supabaseAdmin
      .from("inventory_movements")
      .insert({
        product_id: productId,
        movement_type: "ADJUSTMENT",
        quantity: changeQty,
        reference: "تسوية يدوية",
        notes,
      });

    if (movementError) {
      console.error("Failed to record adjustment movement:", movementError);
    }

    revalidateTag("products-list", "default");
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/products");

    return NextResponse.json({
      message: "تم إجراء التسوية المخزنية وتحديث الرصيد بنجاح",
      newStock,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        message: "خطأ في السيرفر",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
