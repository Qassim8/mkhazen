import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { revalidatePath, revalidateTag } from "next/cache";
import { updateSupplierSchema } from "@/app/dashboard/suppliers/schemas/supplier.schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط" },
        { status: 403 },
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "حدث خطأ غير متوقع";
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء جلب المورد", error: message },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validation = updateSupplierSchema.safeParse(body);

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
      ...(validation.data.name !== undefined && {
        name: validation.data.name,
      }),

      ...(validation.data.phone !== undefined && {
        phone: validation.data.phone,
      }),

      ...(validation.data.email !== undefined && {
        email: validation.data.email,
      }),

      ...(validation.data.address !== undefined && {
        address: validation.data.address,
      }),

      ...(validation.data.contactPerson !== undefined && {
        contactPerson: validation.data.contactPerson,
      }),

      ...(validation.data.notes !== undefined && {
        notes: validation.data.notes,
      }),

      ...(validation.data.isActive !== undefined && {
        isActive: validation.data.isActive,
      }),

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "حدث خطأ غير متوقع";
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء تعديل المورد", error: message },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id, name")
      .eq("id", id)
      .single();

    if (supplierError || !supplier) {
      return NextResponse.json(
        { message: "المورد غير موجود" },
        { status: 404 },
      );
    }

    const { error } = await supabaseAdmin
      .from("suppliers")
      .delete()
      .eq("id", id);

    if (error) {
      if (error.code === "23503") {
        return NextResponse.json(
          {
            message:
              "لا يمكن حذف هذا المورد لوجود عمليات شراء أو منتجات مرتبطة به. يفضل تعديل حالته إلى (غير نشط) بدلاً من الحذف.",
          },
          { status: 409 },
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "حدث خطأ غير متوقع";
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء حذف المورد", error: message },
      { status: 500 },
    );
  }
}
