import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/permissions-server";
import { revalidatePath, revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase";
import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { runIdempotentRpc } from "@/lib/idempotency";
import { money, notifyOwnerOfCashierAction } from "@/app/api/_lib/cashier-audit";

import { inventoryAdjustmentSchema } from "@/app/dashboard/inventory/schema/inventory.schemas";

export async function POST(request: Request) {
  try {
    /* =====================================================
       AUTH
    ===================================================== */

    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    if (!user || !can(user.role, "inventory.adjust")) {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك",
          code: "FORBIDDEN",
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

    const entryNumber = `ADJ-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

    /* =====================================================
       PROCESS ATOMIC TRANSACTION
    ===================================================== */

    return await runIdempotentRpc<unknown>({
      request,
      scope: "inventory.adjustment",
      userId: user.userId,
      payload: validation.data,
      context: "process_inventory_adjustment",
      fallbackMessage: "تعذر إجراء التسوية المخزنية",
      hideBalances: !can(user.role, "accounting.view"),
      rpc: () =>
        supabaseAdmin.rpc("process_inventory_adjustment", {
          p_variant_id: variantId,
          p_user_id: user.userId ?? null,
          p_adjustment_type: adjustmentType,
          p_quantity: Math.abs(quantity),
          p_notes: notes ?? null,
          p_entry_number: entryNumber,
          /*
            IN:  negative amount = customer refund
            OUT: positive amount = supplier refund
          */
          p_amount: Number(amount.toFixed(2)),
          p_payment_method: paymentMethod ?? null,
          p_branch_id: MAIN_BRANCH_ID,
        }),
      onSuccess: async (result) => {
        const { data: variant } = await supabaseAdmin
          .from("product_variants")
          .select('sku, product_templates ( name )')
          .eq("id", variantId)
          .maybeSingle();
        const templates = (variant as { product_templates?: { name?: string } | { name?: string }[] | null } | null)
          ?.product_templates;
        const productName = (Array.isArray(templates) ? templates[0]?.name : templates?.name) ?? "صنف";
        const hasAmount = Number(amount) !== 0;

        await notifyOwnerOfCashierAction({
          actor: user,
          kind: "INVENTORY_ADJUSTMENT",
          title: hasAmount ? "تسوية مخزنية بمبلغ مالي من الكاشير" : "تسوية مخزنية من الكاشير",
          details:
            `${adjustmentType === "IN" ? "إدخال" : "إخراج"} ${Math.abs(quantity)} من ${productName}` +
            (hasAmount
              ? ` بمبلغ ${money(Math.abs(amount), adjustmentType === "IN" ? "SDG" : "USD")}` +
                (adjustmentType === "IN" ? " (استرجاع من عميل)" : " (إرجاع لمورد)")
              : "") +
            (notes ? ` — ${notes}` : ""),
          link: "/dashboard/inventory",
          amount: hasAmount ? Math.abs(amount) : 0,
          currency: adjustmentType === "IN" ? "SDG" : "USD",
          metadata: { variant_id: variantId, adjustment_type: adjustmentType, quantity },
        });

        revalidateTag("products-list", "default");
        revalidateTag("purchases-list", "default");
        revalidateTag("inventory-list", "default");
        revalidateTag("inventory-movements", "default");
        revalidateTag("accounting-entries", "default");
        revalidateTag("accounting-summary", "default");
        revalidatePath("/dashboard/inventory");
        revalidatePath("/dashboard/products");
        revalidatePath("/dashboard/accounting");

        return {
          body: {
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
        };
      },
    });
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
