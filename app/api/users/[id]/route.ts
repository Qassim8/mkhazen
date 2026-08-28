import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { updateEmployeeSchema } from "@/app/dashboard/employees/schemas/employee.schemas";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth";

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
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
    }

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
    const user = await getSession();
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = await request.json();

    const updatePayload: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    // 1️⃣ تحديث كلمة المرور في Supabase Auth إذا كانت موجودة
    if (body.password) {
      const { error: authError } =
        await supabaseAdmin.auth.admin.updateUserById(id, {
          password: body.password,
        });

      // إذا لم يكن المستخدم موجوداً في Supabase Auth، نحاول إيجاده بالـ Email أو ربطه
      if (authError) {
        // إذا كان الخطأ أن المستخدم غير موجود في Auth
        if (authError.message.includes("User not found")) {
          // جلب بريد المستخدم من جدول users لربطه/تحديثه
          const { data: dbUser } = await supabaseAdmin
            .from("users")
            .select("email")
            .eq("id", id)
            .single();

          if (dbUser?.email) {
            // إنشاء المستخدم في Supabase Auth بنفس الـ ID والـ Email
            const { error: createAuthError } =
              await supabaseAdmin.auth.admin.createUser({
                id: id,
                email: dbUser.email,
                password: body.password,
                email_confirm: true,
              });

            if (
              createAuthError &&
              !createAuthError.message.includes("already")
            ) {
              return NextResponse.json(
                { message: `فشل تحديث Auth: ${createAuthError.message}` },
                { status: 400 },
              );
            }
          }
        } else {
          return NextResponse.json(
            { message: authError.message },
            { status: 400 },
          );
        }
      }

      if (typeof body.resetRequested !== "undefined") {
        updatePayload.resetRequested = Boolean(body.resetRequested);
      }
    }
    // 2️⃣ تحديث البيانات العادية
    else {
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

      Object.assign(updatePayload, validation.data);

      if (validation.data.position) {
        updatePayload.role =
          positionToRoleMap[validation.data.position] || "tailor";
      }

      if (typeof body.resetRequested !== "undefined") {
        updatePayload.resetRequested = Boolean(body.resetRequested);
      }
    }

    // 3️⃣ تحديث البيانات في جدول users
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
    const user = await getSession();
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط" },
        { status: 403 },
      );
    }

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
