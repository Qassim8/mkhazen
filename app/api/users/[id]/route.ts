import bcrypt from "bcryptjs";
import { requireLogin } from "@/lib/permissions-server";
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase";
import { invalidateAccountCache, type TokenPayload } from "@/lib/auth";
import { can, normalizeRole } from "@/lib/permissions";
import { updateEmployeeSchema } from "@/app/dashboard/employees/schemas/employee.schemas";

type Params = {
  params: Promise<{ id: string }>;
};

const positionToRoleMap: Record<string, string> = {
  system_manager: "admin",
  cashier: "cashier",
  tailor: "tailor",
};

// أعمدة آمنة للعرض (بدون كلمة السر)
const SAFE_COLUMNS =
  'id, name, email, role, position, phone, salary, shift, "isActive", "isPasswordChanged", "resetRequested", "commissionRate", "branchId", "createdAt", "updatedAt"';

function forbidden(message: string) {
  return NextResponse.json({ message,
  code: "FORBIDDEN",
}, { status: 403 });
}

/**
 * قواعد التسلسل:
 * • حساب المالك: محدش يعدّله غير المالك نفسه، ومحدش يحذفه، ودوره ما يتغيرش.
 * • حسابات المديرين: المالك بس يضيفها أو يعدّلها أو يحذفها.
 * • الكاشير والخياط: المالك والمدير.
 */
function checkCanManageTarget(
  actor: TokenPayload,
  target: { id: string; role: string },
): string | null {
  const targetRole = normalizeRole(target.role);

  if (targetRole === "owner") {
    return actor.userId === target.id ? null : "لا يمكن تعديل حساب المالك.";
  }

  if (targetRole === "admin" && !can(actor.role, "users.manageAdmins")) {
    return "إدارة حسابات المديرين متاحة للمالك فقط.";
  }

  if (!can(actor.role, "users.manageStaff")) {
    return "ليس لديك صلاحية إدارة الموظفين.";
  }

  return null;
}

function actorIsSelf(actor: TokenPayload, target: { id: string }) {
  return actor.userId === target.id;
}

async function loadTarget(id: string) {
  const { data } = await supabaseAdmin
    .from("users")
    .select("id, name, role")
    .eq("id", id)
    .maybeSingle();
  return data as { id: string; name: string; role: string } | null;
}

// GET: جلب موظف محدد (لنفسه أو للإدارة) — بدون كلمة السر
export async function GET(request: Request, { params }: Params) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;
    if (!user) {
      return NextResponse.json({ message: "غير مصرح", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { id } = await params;

    // authorize before looking the target up (no "exists / does not exist" oracle)
    if (id !== user.userId && !can(user.role, "users.manageStaff")) {
      return forbidden("ليس لديك صلاحية عرض بيانات هذا الموظف.");
    }

    const target = await loadTarget(id);

    if (
      !target ||
      (normalizeRole(target.role) === "owner" &&
        normalizeRole(user.role) !== "owner")
    ) {
      return NextResponse.json({ message: "الموظف غير موجود" }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .select(SAFE_COLUMNS)
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ message: "الموظف غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { message: "خطأ في السيرفر", error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// PUT: تعديل بيانات موظف أو إعادة تعيين كلمة السر
export async function PUT(request: Request, { params }: Params) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;
    if (!user) {
      return NextResponse.json({ message: "غير مصرح", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { id } = await params;

    // authorize before looking the target up (no "exists / does not exist" oracle);
    // the detailed per-target rules below still apply
    if (
      id !== user.userId &&
      !can(user.role, "users.manageStaff") &&
      !can(user.role, "users.resetPasswords")
    ) {
      return forbidden("ليس لديك صلاحية إدارة الموظفين.");
    }

    const target = await loadTarget(id);

    if (!target) {
      return NextResponse.json({ message: "الموظف غير موجود" }, { status: 404 });
    }

    const body = await request.json();
    const targetIsOwner = normalizeRole(target.role) === "owner";

    // إعادة تعيين كلمة السر عملية تشغيلية: المدير يقدر يعملها لأي موظف
    // (حتى مدير تاني)، والمالك بس هو اللي يغيّر كلمة سر نفسه.
    const denied = body.password
      ? targetIsOwner
        ? actorIsSelf(user, target) ? null : "لا يمكن تعديل حساب المالك."
        : can(user.role, "users.resetPasswords")
          ? null
          : "ليس لديك صلاحية إعادة تعيين كلمات السر."
      : checkCanManageTarget(user, target);

    if (denied) return forbidden(denied);

    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    // 1️⃣ إعادة تعيين كلمة السر
    // تسجيل الدخول بيقارن users.password (bcrypt)، فالتحديث لازم يكون هنا.
    // الموظف هيتطلب منه تغييرها أول ما يدخل.
    if (body.password) {
      const password = String(body.password);

      if (password.length < 8 || password.length > 200) {
        return NextResponse.json(
          { message: "كلمة السر يجب ألا تقل عن 8 أحرف", code: "VALIDATION_ERROR" },
          { status: 422 },
        );
      }

      updatePayload.password = await bcrypt.hash(password, 10);
      updatePayload.isPasswordChanged = false;
      updatePayload.resetRequested = false;
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
        const nextRole = positionToRoleMap[validation.data.position] || "tailor";

        if (targetIsOwner) {
          // دور المالك ثابت مهما اتغير المسمى
          delete updatePayload.position;
        } else {
          if (nextRole === "admin" && !can(user.role, "users.manageAdmins")) {
            return forbidden("الترقية لمدير متاحة للمالك فقط.");
          }
          updatePayload.role = nextRole;
        }
      }

      if (typeof body.resetRequested !== "undefined") {
        updatePayload.resetRequested = Boolean(body.resetRequested);
      }
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .update(updatePayload)
      .eq("id", id)
      .select(SAFE_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    invalidateAccountCache(id);

    if (body.password) {
      // طلب إعادة التعيين اتنفذ → إشعاره يتقفل
      await supabaseAdmin
        .from("notifications")
        .update({ isRead: true })
        .eq("type", "RESET_PASSWORD")
        .eq("metadata->>user_id", id)
        .eq("isRead", false);
    }

    revalidateTag("employees-list", "default");
    revalidatePath("/dashboard/employees");

    return NextResponse.json(
      {
        message: body.password
          ? "تم تعيين كلمة السر الجديدة، وسيُطلب من الموظف تغييرها عند الدخول"
          : "تم تحديث بيانات الموظف بنجاح",
        data,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { message: "خطأ في السيرفر", error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// DELETE: حذف موظف
export async function DELETE(request: Request, { params }: Params) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;
    if (!user) {
      return NextResponse.json({ message: "غير مصرح", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { id } = await params;

    if (id === user.userId) {
      return forbidden("لا يمكنك حذف حسابك.");
    }

    if (!can(user.role, "users.manageStaff")) {
      return forbidden("ليس لديك صلاحية إدارة الموظفين.");
    }

    const target = await loadTarget(id);
    if (!target) {
      return NextResponse.json({ message: "فشل الحذف، الموظف غير موجود" }, { status: 400 });
    }

    if (normalizeRole(target.role) === "owner") {
      return forbidden("لا يمكن حذف حساب المالك.");
    }

    const denied = checkCanManageTarget(user, target);
    if (denied) return forbidden(denied);

    const { data, error } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", id)
      .select("id, name")
      .single();

    invalidateAccountCache(id);

    if (error || !data) {
      return NextResponse.json(
        {
          message:
            "تعذر حذف الموظف. لو عليه عمليات مسجلة (مبيعات، طلبات، قيود) عطّل حسابه بدل الحذف.",
        },
        { status: 400 },
      );
    }

    revalidateTag("employees-list", "default");
    revalidatePath("/dashboard/employees");

    return NextResponse.json(
      { message: `تم حذف الموظف ${data.name} بنجاح ✅`, data },
      { status: 200 },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { message: "خطأ في السيرفر", error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
