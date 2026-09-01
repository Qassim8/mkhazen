import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { revalidatePath, revalidateTag } from "next/cache";
import { createSupplierSchema } from "@/app/dashboard/suppliers/schemas/supplier.schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { message: "غير مصرح لك بالوصول. يرجى تسجيل الدخول أولاً." },
        { status: 401 },
      );
    }

    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from("suppliers")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { message: "المورد غير موجود" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء جلب المورد", error: err.message },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { message: "غير مصرح لك بإجراء التعديل. يرجى تسجيل الدخول أولاً." },
        { status: 401 },
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validation = createSupplierSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات التعديل غير صحيحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    // بناء الكائن للتحديث
    const updatePayload = {
      name: validation.data.name,
      phone: validation.data.phone,
      email: validation.data.email,
      address: validation.data.address ?? null,
      contactPerson: validation.data.contactPerson ?? null,
      isActive: validation.data.isActive,
      updatedAt: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("suppliers")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { message: `فشل تعديل المورد: ${error.message}` },
        { status: 400 },
      );
    }

    revalidateTag("suppliers-list", "default");
    revalidatePath("/dashboard/suppliers");

    return NextResponse.json(
      { message: "تم تحديث بيانات المورد بنجاح", data },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء تعديل المورد", error: err.message },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { message: "غير مصرح لك بحذف المورد. يرجى تسجيل الدخول أولاً." },
        { status: 401 },
      );
    }

    const { id } = await params;

    const { error } = await supabaseAdmin
      .from("suppliers")
      .delete()
      .eq("id", id);

    if (error) {
      // 23503 هو رمز الخطأ لتقييد المفتاح الأجنبي (Foreign Key Constraint) في Postgres
      if (error.code === "23503") {
        return NextResponse.json(
          {
            message:
              "لا يمكن حذف هذا المورد لوجود عمليات شراء أو منتجات مرتبطة به. يفضل تعديل حالته إلى (غير نشط) بدلاً من الحذف.",
          },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { message: `تعذر حذف المورد: ${error.message}` },
        { status: 400 },
      );
    }

    revalidateTag("suppliers-list", "default");
    revalidatePath("/dashboard/suppliers");

    return NextResponse.json(
      { message: "تم حذف المورد بنجاح" },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء حذف المورد", error: err.message },
      { status: 500 },
    );
  }
}
