import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";

import { createAssetSchema } from "@/app/dashboard/accounting/schemas/accounting.schema";
import { getAccountBalance } from "../_lib/accounting";

/* =========================================================
   GET ASSETS
========================================================= */

export async function GET(request: Request) {
  try {
    const user = await getSession();

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط",
        },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const category = searchParams.get("category");
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number(searchParams.get("limit")) || 20),
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("assets")
      .select(
        `
          id,
          branch_id,
          created_by,
          name,
          category,
          purchase_value,
          purchase_date,
          payment_method,
          reference,
          notes,
          created_at,

          users:created_by (
            id,
            name
          )
        `,
        { count: "exact" },
      )
      .eq("branch_id", MAIN_BRANCH_ID);

    let totalValueQuery = supabaseAdmin
      .from("assets")
      .select("purchase_value")
      .eq("branch_id", MAIN_BRANCH_ID);

    if (category && category !== "ALL") {
      query = query.eq("category", category);
      totalValueQuery = totalValueQuery.eq("category", category);
    }

    if (search) {
      const searchFilter = `name.ilike.%${search}%,reference.ilike.%${search}%`;
      query = query.or(searchFilter);
      totalValueQuery = totalValueQuery.or(searchFilter);
    }

    const [{ data, count, error }, { data: valueRows, error: valueError }] =
      await Promise.all([
        query.order("created_at", { ascending: false }).range(from, to),
        totalValueQuery,
      ]);

    if (error || valueError) {
      throw new Error(error?.message ?? valueError?.message);
    }

    return NextResponse.json({
      data: data ?? [],
      meta: {
        total: count ?? 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0,
      },
      totalValue: (valueRows ?? []).reduce(
        (sum, asset) => sum + Number(asset.purchase_value ?? 0),
        0,
      ),
    });
  } catch (error: unknown) {
    console.error("Assets GET:", error);

    return NextResponse.json(
      {
        message: "حدث خطأ أثناء جلب الأصول",
      },
      { status: 500 },
    );
  }
}

/* =========================================================
   POST ASSET (USING SUPABASE RPC TRANSACTION)
========================================================= */

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
    const validation = createAssetSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات الأصل غير صالحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const {
      name,
      category,
      purchaseValue,
      purchaseDate,
      paymentMethod,
      reference,
      notes,
    } = validation.data;

    // تحويل التاريخ إلى صيغة YYYY-MM-DD لتناسب العمود من نوع DATE في Postgres/RPC
    const formattedDate =
      purchaseDate instanceof Date
        ? purchaseDate.toISOString().split("T")[0]
        : String(purchaseDate).split("T")[0];

    const account = paymentMethod === "BANK" ? "BANK" : "CASH";
    const currentBalance = await getAccountBalance(account);

    if (purchaseValue > currentBalance) {
      const accountLabel = account === "BANK" ? "البنك" : "الخزينة";

      return NextResponse.json(
        {
          message: `الرصيد غير كافٍ في ${accountLabel}. الرصيد الحالي ${currentBalance.toFixed(
            2,
          )} ريال. سجّل رأس المال أولًا أو استخدم الحساب الذي يحتوي على رصيد.`,
        },
        { status: 400 },
      );
    }

    const entryNumber = `AST-${Date.now()}`;

    const { data: assetData, error: rpcError } = await supabaseAdmin.rpc(
      "create_asset_with_journal_entry",
      {
        p_branch_id: MAIN_BRANCH_ID,
        p_created_by: user.userId ?? null,
        p_name: name,
        p_category: category,
        p_purchase_value: purchaseValue,
        p_purchase_date: formattedDate, // تمرير التاريخ بصيغة YYYY-MM-DD
        p_payment_method: paymentMethod,
        p_reference: reference ?? null,
        p_notes: notes ?? null,
        p_entry_number: entryNumber,
      },
    );

    if (rpcError) {
      throw new Error(rpcError.message || "تعذر تسجيل الأصل والقيد المحاسبي");
    }

    revalidateTag("accounting-assets", "default");
    revalidateTag("accounting-entries", "default");
    revalidateTag("accounting-summary", "default");
    revalidateTag("accounting-overview", "default");

    revalidatePath("/dashboard/accounting");
    revalidatePath("/dashboard/accounting/assets");

    return NextResponse.json(
      {
        message: "تم تسجيل الأصل والقيد المحاسبي بنجاح",
        data: assetData,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Assets POST:", error);

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "تعذر تسجيل الأصل",
      },
      { status: 500 },
    );
  }
}
