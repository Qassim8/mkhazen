import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidateTag, revalidatePath } from "next/cache";
import { productSchema } from "@/lib/validations/product.schemas";

type Params = {
  params: Promise<{ id: string }>;
};

// 1. جلب تفاصيل منتج محدد
export async function GET(_request: Request, { params }: Params) {
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
      { message: "خطأ في السيرفر", error: err.message },
      { status: 500 },
    );
  }
}

// 2. تعديل بيانات المنتج
export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const validation = productSchema.partial().safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات التعديل غير صالحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const updatePayload = {
      ...validation.data,
      updatedAt: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("products")
      .update(updatePayload)
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
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    revalidateTag("products-list", "default");
    revalidatePath("/dashboard/products");

    return NextResponse.json(
      { message: "تم تعديل المنتج بنجاح", data },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء التعديل", error: err.message },
      { status: 500 },
    );
  }
}

// 3. حذف المنتج (مع حذف صورته من Storage إن وجدت)
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;

    // جلب صورة المنتج لحذفها من الـ Storage
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("imageUrl")
      .eq("id", id)
      .single();

    if (product?.imageUrl) {
      const urlParts = product.imageUrl.split("/products/");
      if (urlParts.length > 1) {
        const filePath = `products/${urlParts[1]}`;
        await supabaseAdmin.storage.from("products").remove([filePath]);
      }
    }

    const { error } = await supabaseAdmin
      .from("products")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    revalidateTag("products-list", "default");
    revalidatePath("/dashboard/products");

    return NextResponse.json(
      { message: "تم حذف المنتج بنجاح" },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء الحذف", error: err.message },
      { status: 500 },
    );
  }
}
