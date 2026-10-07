/**
 * /api/inventory/opening-stock — المخزون الافتتاحي
 *
 * GET  → الأصناف المؤهلة (نشطة، رصيدها صفر، ومعندهاش أي حركة مخزون)
 * POST → تسجيل الكميات والتكاليف الافتتاحية
 *
 * القيد المحاسبي: مدين INVENTORY / دائن CAPITAL — البضاعة مساهمة من المالك،
 * مش إيراد ولا دين على مورد. التنفيذ كله في دالة قاعدة البيانات
 * record_opening_stock عشان يكون ذرّيًا.
 */

import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";
import { openingStockSchema } from "@/app/dashboard/inventory/schema/inventory.schemas";

type CandidateRow = {
  id: string;
  template_id: string;
  product_name: string;
  sku: string | null;
  barcode: string | null;
  color_name: string | null;
  size: string | null;
  selling_unit: string | null;
  selling_price: number | string | null;
  purchase_price: number | string | null;
  average_cost: number | string | null;
  min_stock_level: number | string | null;
};

const num = (value: number | string | null) =>
  value === null || value === "" ? null : Number(value);

export async function GET() {
  const guard = await requirePermission("inventory.openingStock");
  if (!guard.ok) return guard.response;

  try {
    const { data, error } = await supabaseAdmin.rpc("list_opening_stock_candidates");

    if (error) {
      console.error("list_opening_stock_candidates RPC:", error);
      return NextResponse.json(
        { message: error.message || "تعذر جلب الأصناف المؤهلة." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      data: ((data ?? []) as CandidateRow[]).map((row) => ({
        id: row.id,
        templateId: row.template_id,
        productName: row.product_name,
        sku: row.sku,
        barcode: row.barcode,
        colorName: row.color_name,
        size: row.size,
        sellingUnit: row.selling_unit,
        sellingPrice: num(row.selling_price),
        purchasePrice: num(row.purchase_price),
        averageCost: num(row.average_cost),
        minStockLevel: num(row.min_stock_level),
      })),
    });
  } catch (error: unknown) {
    console.error("GET /api/inventory/opening-stock:", error);
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
  const guard = await requirePermission("inventory.openingStock");
  if (!guard.ok) return guard.response;

  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json(
        { message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." },
        { status: 500 },
      );
    }

    const validation = openingStockSchema.safeParse(await request.json());

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات المخزون الافتتاحي غير صالحة.",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { data, error } = await supabaseAdmin.rpc("record_opening_stock", {
      p_branch_id: MAIN_BRANCH_ID,
      p_user_id: guard.session.userId,
      p_items: validation.data.items,
      p_notes: validation.data.notes ?? null,
    });

    if (error) {
      console.error("record_opening_stock RPC:", error);
      return NextResponse.json(
        { message: error.message || "تعذر تسجيل المخزون الافتتاحي." },
        { status: 400 },
      );
    }

    revalidateTag("products-list", "default");
    revalidateTag("inventory-list", "default");
    revalidateTag("inventory-movements", "default");
    revalidateTag("accounting-entries", "default");
    revalidateTag("accounting-summary", "default");

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/accounting");

    const result = data as {
      journal_entry_id: string;
      entry_number: string;
      items_count: number;
      total_cost_usd: number | string;
    };

    return NextResponse.json(
      {
        message: `تم تسجيل المخزون الافتتاحي لـ ${result.items_count} صنف بنجاح.`,
        data: {
          journalEntryId: result.journal_entry_id,
          entryNumber: result.entry_number,
          itemsCount: result.items_count,
          totalCostUsd: Number(result.total_cost_usd ?? 0),
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("POST /api/inventory/opening-stock:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "خطأ غير متوقع في السيرفر.",
      },
      { status: 500 },
    );
  }
}
