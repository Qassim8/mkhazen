/**
 * /api/inventory/opening-stock/correct — "تعديل" كمية/تكلفة مخزون افتتاحي
 *
 * GET  → الأصناف المؤهلة للتصحيح (حركة واحدة فقط من نوع OPENING_STOCK،
 *        أي ما حدثت عليها أي حركة أخرى منذ تسجيلها)
 * POST → تنفيذ التصحيح: تحديث الكمية/متوسط التكلفة + حركة تعديل توثّق
 *        الفرق + قيد محاسبي جديد بفرق القيمة فقط. القيد الافتتاحي الأصلي
 *        لا يُعدَّل ولا يُحذف. التنفيذ كله ذرّي داخل correct_opening_stock_entry.
 */

import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { requireLogin } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";
import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { runIdempotentRpc } from "@/lib/idempotency";

import { correctOpeningStockSchema } from "@/app/dashboard/inventory/schema/inventory.schemas";

type CorrectionCandidateRow = {
  variant_id: string;
  template_id: string;
  product_name: string;
  sku: string | null;
  barcode: string | null;
  color_name: string | null;
  size: string | null;
  selling_unit: string | null;
  quantity: number | string;
  unit_cost: number | string;
  movement_id: string;
  movement_created_at: string;
  reference: string | null;
};

export async function GET() {
  const guard = await requireLogin();
  if (!guard.ok) return guard.response;
  const user = guard.session;

  if (!user || !can(user.role, "inventory.openingStock")) {
    return NextResponse.json(
      { message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("list_opening_stock_corrections");

    if (error) {
      console.error("list_opening_stock_corrections RPC:", error);
      return NextResponse.json(
        { message: error.message || "تعذر جلب الأصناف المؤهلة للتصحيح." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      data: ((data ?? []) as CorrectionCandidateRow[]).map((row) => ({
        variantId: row.variant_id,
        templateId: row.template_id,
        productName: row.product_name,
        sku: row.sku,
        barcode: row.barcode,
        colorName: row.color_name,
        size: row.size,
        sellingUnit: row.selling_unit,
        quantity: Number(row.quantity),
        unitCost: Number(row.unit_cost),
        movementId: row.movement_id,
        movementCreatedAt: row.movement_created_at,
        reference: row.reference,
      })),
    });
  } catch (error: unknown) {
    console.error("GET /api/inventory/opening-stock/correct:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "خطأ غير متوقع في السيرفر.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const guard = await requireLogin();
  if (!guard.ok) return guard.response;
  const user = guard.session;

  if (!user || !can(user.role, "inventory.openingStock")) {
    return NextResponse.json(
      { message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json(
        { message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." },
        { status: 500 },
      );
    }

    const body = await request.json();

    const validation = correctOpeningStockSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات التصحيح غير صالحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { variantId, quantity, unitCost, notes } = validation.data;

    return await runIdempotentRpc<unknown>({
      request,
      scope: "inventory.openingStock.correct",
      userId: user.userId,
      payload: validation.data,
      context: "correct_opening_stock_entry",
      fallbackMessage: "تعذر تصحيح المخزون الافتتاحي",
      rpc: () =>
        supabaseAdmin.rpc("correct_opening_stock_entry", {
          p_branch_id: MAIN_BRANCH_ID,
          p_user_id: user.userId ?? null,
          p_variant_id: variantId,
          p_new_quantity: quantity,
          p_new_unit_cost: unitCost,
          p_notes: notes ?? null,
        }),
      onSuccess: (result) => {
        revalidateTag("products-list", "default");
        revalidateTag("inventory-list", "default");
        revalidateTag("inventory-movements", "default");
        revalidateTag("accounting-entries", "default");
        revalidateTag("accounting-summary", "default");

        revalidatePath("/dashboard/inventory");
        revalidatePath("/dashboard/products");
        revalidatePath("/dashboard/accounting");

        const row = result as {
          variant_id: string;
          old_quantity: number | string;
          new_quantity: number | string;
          old_unit_cost: number | string;
          new_unit_cost: number | string;
          delta_value_usd: number | string;
          movement_id: string | null;
          journal_entry_id: string | null;
          entry_number: string;
        };

        return {
          status: 200,
          body: {
            message: "تم تصحيح المخزون الافتتاحي بنجاح",
            data: {
              variantId: row.variant_id,
              oldQuantity: Number(row.old_quantity),
              newQuantity: Number(row.new_quantity),
              oldUnitCost: Number(row.old_unit_cost),
              newUnitCost: Number(row.new_unit_cost),
              deltaValueUsd: Number(row.delta_value_usd),
              movementId: row.movement_id,
              journalEntryId: row.journal_entry_id,
              entryNumber: row.entry_number,
            },
          },
        };
      },
    });
  } catch (error: unknown) {
    console.error("POST /api/inventory/opening-stock/correct:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "خطأ غير متوقع في السيرفر.",
      },
      { status: 500 },
    );
  }
}
