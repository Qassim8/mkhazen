import { errorMessage } from "@/lib/errors";
import { requireLogin } from "@/lib/permissions-server";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import {
  employeeQuerySchema,
  createEmployeeSchema,
} from "@/app/dashboard/employees/schemas/employee.schemas";
import { supabaseAdmin } from "@/lib/supabase";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { revalidatePath, revalidateTag } from "next/cache";
import { can, normalizeRole } from "@/lib/permissions";
import { generateTemporaryPassword } from "@/lib/temporary-password";
import { sanitizeSearchTerm } from "@/lib/postgrest";

export async function GET(request: Request) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;
    if (!user || !can(user.role, "users.manageStaff")) {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = employeeQuerySchema.safeParse(
      Object.fromEntries(searchParams),
    );

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          message: "بيانات غير صالحة",
          errors: parsedQuery.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { page, limit, position, shift, isActive, resetRequested } =
      parsedQuery.data;
    const search = sanitizeSearchTerm(parsedQuery.data.search);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("users")
      .select('id, name, email, role, position, phone, salary, shift, "isActive", "isPasswordChanged", "resetRequested", "commissionRate", "branchId", "createdAt", "updatedAt"', { count: "exact" })
      .eq("branchId", MAIN_BRANCH_ID);

    if (normalizeRole(user.role) !== "owner") {
      query = query.neq("role", "owner");
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
      );
    }

    if (position) query = query.eq("position", position);
    if (shift) query = query.eq("shift", shift);
    if (isActive) query = query.eq("isActive", isActive);
    if (resetRequested) {
      query = query.eq("resetRequested", "TRUE");
    }

    const { data, count, error } = await query
      .order("createdAt", { ascending: false })
      .range(from, to);

    if (error)
      return NextResponse.json({ message: error.message }, { status: 400 });

    return NextResponse.json({
      data,
      meta: {
        totalCount: count || 0,
        totalPages: count ? Math.ceil(count / limit) : 0,
        currentPage: page,
        limit,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { message: "خطأ في السيرفر", error: errorMessage(err) },
      { status: 500 },
    );
  }
}

// POST: إضافة موظف
export async function POST(request: Request) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    if (!user || !can(user.role, "users.manageStaff")) {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    const body = await request.json();
    const validation = createEmployeeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "خطأ في البيانات المدخلة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { position, salary, commissionRate } = validation.data;

    if (position === "system_manager" && !can(user.role, "users.manageAdmins")) {
      return NextResponse.json(
        { message: "إضافة مدير متاحة للمالك فقط.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    const isTailor = position === "tailor";

    const finalSalary = isTailor ? 0 : salary || 0;
    const finalCommission = isTailor ? (commissionRate ?? 50) : 0;

    // كلمة سر مؤقتة عشوائية (مش مشتقة من البريد) بتظهر مرة واحدة للي أنشأ الحساب،
    // والموظف مطالب بتغييرها أول ما يدخل (isPasswordChanged = false)
    const temporaryPassword = generateTemporaryPassword();
    const hashPassword = await bcrypt.hash(temporaryPassword, 10);

    const newUserData = {
      ...validation.data,
      isPasswordChanged: false,
      resetRequested: false,
      salary: finalSalary,
      commissionRate: finalCommission,
      branchId: MAIN_BRANCH_ID,
      role: position === "system_manager" ? "admin" : position,
      password: hashPassword,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("users")
      .insert([newUserData])
      .select('id, name, email, role, position, phone, salary, shift, "isActive", "isPasswordChanged", "resetRequested", "commissionRate", "branchId", "createdAt", "updatedAt"')
      .single();

    if (error)
      return NextResponse.json({ message: error.message }, { status: 400 });

    revalidateTag("employees-list", "default");
    revalidatePath("/dashboard/employees");

    return NextResponse.json(
      {
        message: "تمت إضافة الموظف بنجاح",
        data,
        // تظهر مرة واحدة فقط — مش متخزنة في أي مكان غير كهاش
        temporaryPassword,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { message: "خطأ في معالجة الطلب", error: errorMessage(err) },
      { status: 500 },
    );
  }
}
