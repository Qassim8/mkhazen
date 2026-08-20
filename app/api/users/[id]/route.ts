import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { updateEmployeeSchema } from "@/lib/validations/employee.schemas";
import { revalidatePath, revalidateTag } from "next/cache";

type Params = {
  params: Promise<{ id: string }>;
};

const positionToRoleMap: Record<string, string> = {
  system_manager: "admin",
  cashier: "cashier",
  tailor: "tailor",
};

// GET: جلب موظف محدد
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { message: "الموظف غير موجود" },
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

// PUT: تعديل بيانات موظف
export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const validation = updateEmployeeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات التعديل غير صالحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const updatePayload: Record<string, any> = {
      ...validation.data,
      updatedAt: new Date().toISOString(),
    };

    if (validation.data.position) {
      updatePayload.role =
        positionToRoleMap[validation.data.position] || "tailor";
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    revalidateTag("employees-list", "default");
    revalidatePath("/dashboard/employees");

    return NextResponse.json(
      { message: "تم تحديث بيانات الموظف بنجاح", data },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر", error: err.message },
      { status: 500 },
    );
  }
}

// DELETE: حذف موظف
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { message: "فشل الحذف، الموظف غير موجود" },
        { status: 400 },
      );
    }

    revalidateTag("employees-list", "default");
    revalidatePath("/dashboard/employees");

    return NextResponse.json(
      {
        message: `تم حذف الموظف ${data.name} بنجاح ✅`,
        data,
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر", error: err.message },
      { status: 500 },
    );
  }
}
