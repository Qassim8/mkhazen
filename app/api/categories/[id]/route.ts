import { errorMessage } from "@/lib/errors";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { categorySchema } from "@/app/dashboard/categories/schemas/category.schemas";
import { revalidateTag, revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { requireLogin } from "@/lib/permissions-server";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const guard = await requireLogin();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from("categories")
      .select(
        `
        *,
        product_templates(count)
      `,
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { message: "الفئة غير موجودة" },
        { status: 404 },
      );
    }

    const formattedData = {
      ...data,
      productsCount: data.product_templates?.[0]?.count ?? 0,
    };

    return NextResponse.json({ data: formattedData }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { message: "خطأ في السيرفر", error: errorMessage(err) },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await getSession();
    if (!user || !can(user.role, "catalog.manage")) {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validation = categorySchema.partial().safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات التعديل غير صالحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const updatePayload: Record<string, string | null | undefined> = {
      updatedAt: new Date().toISOString(),
    };

    if (validation.data.name !== undefined)
      updatePayload.name = validation.data.name;
    if (validation.data.description !== undefined)
      updatePayload.description = validation.data.description;
    if (validation.data.imageUrl !== undefined)
      updatePayload.imageUrl = validation.data.imageUrl;

    const { data, error } = await supabaseAdmin
      .from("categories")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    revalidateTag("categories-list", "default");
    revalidatePath("/dashboard/categories");

    return NextResponse.json(
      { message: "تم تعديل الفئة بنجاح", data },
      { status: 200 },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء التعديل", error: errorMessage(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await getSession();
    if (!user || !can(user.role, "catalog.manage")) {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const { data: category, error: categoryError } = await supabaseAdmin
      .from("categories")
      .select("imageUrl")
      .eq("id", id)
      .single();

    if (categoryError || !category) {
      return NextResponse.json(
        { message: "الفئة غير موجودة" },
        { status: 404 },
      );
    }

    const { data: deletedCategory, error } = await supabaseAdmin
      .from("categories")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (error || !deletedCategory) {
      return NextResponse.json(
        { message: "لا يمكن حذف الفئة لأنها مستخدمة أو حدث خطأ أثناء الحذف" },
        { status: 409 },
      );
    }

    if (category?.imageUrl) {
      const urlParts = category.imageUrl.split("/categories/");
      if (urlParts.length > 1) {
        const filePath = `categories/${urlParts[1]}`;
        await supabaseAdmin.storage.from("store-assets").remove([filePath]);
      }
    }

    revalidateTag("categories-list", "default");
    revalidatePath("/dashboard/categories");

    return NextResponse.json(
      { message: "تم حذف الفئة بنجاح" },
      { status: 200 },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء الحذف", error: errorMessage(err) },
      { status: 500 },
    );
  }
}
