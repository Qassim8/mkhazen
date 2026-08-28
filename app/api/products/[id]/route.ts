import { NextResponse } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { revalidateTag, revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { updateProductSchema } from "@/app/dashboard/products/schemas/product.schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 1. جلب تفاصيل منتج معين (متاح للجميع)
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from("products")
      .select(
        `
        *,
        category:categories(id, name),
        supplier:suppliers(id, name)
      `,
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { message: "المنتج غير موجود" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء جلب تفاصيل المنتج", error: err.message },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { message: "غير مصرح لك بإجراء التعديل." },
        { status: 401 },
      );
    }

    const { id } = await params;
    const body = await request.json();

    //  استخدام schema التعديل وليس الإضافة
    const validation = updateProductSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات التعديل غير صحيحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    //  التأكد من عدم تمرير حقول خطرة في payload
    const { data, error } = await supabaseAdmin
      .from("products")
      .update(validation.data)
      .eq("id", id)
      .select(
        `
        *,
        category:categories(id, name),
        supplier:suppliers(id, name)
      `,
      )
      .single();

    if (error) {
      return NextResponse.json(
        { message: `فشل تعديل المنتج: ${error.message}` },
        { status: 400 },
      );
    }

    revalidateTag("products-list", "default");
    revalidatePath("/dashboard/products");

    return NextResponse.json(
      { message: "تم تحديث بيانات المنتج بنجاح", data },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء تعديل المنتج", error: err.message },
      { status: 500 },
    );
  }
}

// 3. حذف منتج (محمي للأدمن فقط)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();
    await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { message: "غير مصرح لك بحذف هذا المنتج." },
        { status: 401 },
      );
    }

    const { id } = await params;

    const { error } = await supabaseAdmin
      .from("products")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { message: `تعذر حذف المنتج: ${error.message}` },
        { status: 400 },
      );
    }

    revalidateTag("products-list", "default");
    revalidatePath("/dashboard/products");

    return NextResponse.json(
      { message: "تم حذف المنتج بنجاح" },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء حذف المنتج", error: err.message },
      { status: 500 },
    );
  }
}
