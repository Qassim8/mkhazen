import { NextResponse } from "next/server";

import { revalidatePath, revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";

import { createAssetSchema } from "@/app/dashboard/accounting/schemas/accounting.schema";

import { createJournalEntry, getAccountBalance } from "../_lib/accounting";

/* =========================================================
   GET ASSETS
========================================================= */

export async function GET(_request: Request) {
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

    const { data, error } = await supabaseAdmin
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
      )
      .eq("branch_id", MAIN_BRANCH_ID)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      data: data ?? [],
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
   POST ASSET
========================================================= */

export async function POST(request: Request) {
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

    const account = paymentMethod === "BANK" ? "BANK" : "CASH";

    /* =====================================================
       CHECK BALANCE BEFORE CREATING ASSET
    ===================================================== */

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

    /* =====================================================
       CREATE ASSET
    ===================================================== */

    const { data: asset, error: assetError } = await supabaseAdmin
      .from("assets")
      .insert({
        branch_id: MAIN_BRANCH_ID,

        created_by: user.userId ?? null,

        name,
        category,

        purchase_value: purchaseValue,

        purchase_date: purchaseDate,

        payment_method: paymentMethod,

        reference: reference ?? null,

        notes: notes ?? null,
      })
      .select()
      .single();

    if (assetError || !asset) {
      throw new Error(assetError?.message || "تعذر تسجيل الأصل");
    }

    /* =====================================================
       CREATE ACCOUNTING ENTRY

       DR ASSETS
       CR BANK / CASH
    ===================================================== */

    try {
      await createJournalEntry({
        entryType: "ASSET",

        amount: purchaseValue,

        debitAccount: "ASSETS",

        creditAccount: paymentMethod === "BANK" ? "BANK" : "CASH",

        description: `شراء أصل: ${name}`,

        reference: reference ?? null,

        createdBy: user.userId ?? null,
      });
    } catch (journalError) {
      await supabaseAdmin.from("assets").delete().eq("id", asset.id);

      throw journalError;
    }

    /* =====================================================
       CACHE
    ===================================================== */

    revalidateTag("accounting-assets", "default");

    revalidateTag("accounting-entries", "default");

    revalidateTag("accounting-summary", "default");

    revalidateTag("accounting-overview", "default");

    revalidatePath("/dashboard/accounting");

    revalidatePath("/dashboard/accounting/assets");

    return NextResponse.json(
      {
        message: "تم تسجيل الأصل والقيد المحاسبي بنجاح",
        data: asset,
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
