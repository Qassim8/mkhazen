import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth";

import { updateProductSchema } from "@/app/dashboard/products/schemas/product.schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function requireAdmin() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { message: "يرجى تسجيل الدخول أولاً." },
      { status: 401 },
    );
  }

  if (session.role !== "admin") {
    return NextResponse.json(
      { message: "هذه العملية مقتصرة على المدير." },
      { status: 403 },
    );
  }

  return null;
}

const productDetailsSelect = `
  *,
  category:categories(id, name),
  supplier:suppliers(id, name),
  variants:product_variants(*)
`;

async function getFullProduct(id: string) {
  return supabaseAdmin
    .from("product_templates")
    .select(productDetailsSelect)
    .eq("id", id)
    .single();
}

/* =========================================================
   GET /api/products/:id
   Public
   ========================================================= */

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { data, error } = await getFullProduct(id);

    if (error || !data) {
      return NextResponse.json(
        { message: "المنتج غير موجود." },
        { status: 404 },
      );
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error: unknown) {
    console.error("Product GET by id error:", error);

    return NextResponse.json(
      { message: "خطأ غير متوقع أثناء جلب المنتج." },
      { status: 500 },
    );
  }
}

/* =========================================================
   PUT /api/products/:id
   Admin only
   ========================================================= */

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const authError = await requireAdmin();

    if (authError) {
      return authError;
    }

    const { id } = await params;

    const body = await request.json();

    const validation = updateProductSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات تعديل المنتج غير صحيحة.",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    /* تأكد أن المنتج موجود */

    const { data: existingProduct, error: findError } = await supabaseAdmin
      .from("product_templates")
      .select("id")
      .eq("id", id)
      .single();

    if (findError || !existingProduct) {
      return NextResponse.json(
        { message: "المنتج غير موجود." },
        { status: 404 },
      );
    }

    const { variants, ...templateData } = validation.data;

    /*
     * إذا لم تُرسل variants:
     * لا نغيرها.
     *
     * إذا أُرسلت:
     * فهي القائمة النهائية للـ variants.
     */

    const payload = {
      ...templateData,
      ...(variants !== undefined ? { variants } : {}),
    };

    const { data: productId, error } = await supabaseAdmin.rpc(
      "update_product",
      {
        p_product_id: id,
        p_payload: payload,
      },
    );

    if (error) {
      console.error("Update product RPC error:", error);

      if (error.code === "23503") {
        return NextResponse.json(
          {
            message:
              "لا يمكن تعديل المنتج لأن أحد المتغيرات غير مرتبط بهذا المنتج أو مرتبط ببيانات أخرى.",
          },
          { status: 409 },
        );
      }

      if (error.code === "23505") {
        return NextResponse.json(
          {
            message: "تعذر التعديل بسبب تكرار SKU أو Barcode أو Pack Barcode.",
          },
          { status: 409 },
        );
      }

      if (error.code === "22023" || error.code === "P0002") {
        return NextResponse.json({ message: error.message }, { status: 422 });
      }

      return NextResponse.json(
        { message: "فشل تعديل المنتج." },
        { status: 500 },
      );
    }

    const { data: finalProduct, error: finalError } =
      await getFullProduct(productId);

    if (finalError || !finalProduct) {
      console.error("Updated product fetch error:", finalError);

      return NextResponse.json(
        {
          message: "تم تعديل المنتج لكن تعذر استرجاع بياناته النهائية.",
        },
        { status: 500 },
      );
    }

    revalidateTag("products-list", "default");
    revalidatePath("/dashboard/products");
    revalidatePath(`/dashboard/products/${id}`);

    return NextResponse.json(
      {
        message: "تم تحديث المنتج بنجاح.",
        data: finalProduct,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("Product PUT unexpected error:", error);

    return NextResponse.json(
      { message: "خطأ غير متوقع أثناء تعديل المنتج." },
      { status: 500 },
    );
  }
}

/* =========================================================
   DELETE /api/products/:id
   Admin only
   ========================================================= */

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const authError = await requireAdmin();

    if (authError) {
      return authError;
    }

    const { id } = await params;

    /* تأكد أن المنتج موجود */

    const { data: product, error: findError } = await supabaseAdmin
      .from("product_templates")
      .select("id")
      .eq("id", id)
      .single();

    if (findError || !product) {
      return NextResponse.json(
        { message: "المنتج غير موجود." },
        { status: 404 },
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("product_templates")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Product delete error:", deleteError);

      if (deleteError.code === "23503") {
        return NextResponse.json(
          {
            message:
              "لا يمكن حذف المنتج لأنه مرتبط ببيانات أخرى. اجعله غير نشط بدلًا من الحذف.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { message: "تعذر حذف المنتج." },
        { status: 500 },
      );
    }

    revalidateTag("products-list", "default");
    revalidatePath("/dashboard/products");
    revalidatePath(`/dashboard/products/${id}`);

    return NextResponse.json(
      {
        message: "تم حذف المنتج ومتغيراته بنجاح.",
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("Product DELETE unexpected error:", error);

    return NextResponse.json(
      { message: "خطأ غير متوقع أثناء حذف المنتج." },
      { status: 500 },
    );
  }
}
