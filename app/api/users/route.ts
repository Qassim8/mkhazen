import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import {
  employeeQuerySchema,
  createEmployeeSchema,
} from "@/lib/validations/employee.schemas";
import { supabaseAdmin } from "@/lib/supabase";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth";

// GET: جلب الموظفين مفلترين
export async function GET(request: Request) {
  try {
    const user = await getSession();
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط" },
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

    const { page, limit, search, position, shift, isActive, resetRequested } =
      parsedQuery.data;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("users")
      .select("*", { count: "exact" })
      .eq("branchId", MAIN_BRANCH_ID);

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
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر", error: err.message },
      { status: 500 },
    );
  }
}

// POST: إضافة موظف
export async function POST(request: Request) {
  try {
    const user = await getSession();

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط" },
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
    const isTailor = position === "tailor";

    const finalSalary = isTailor ? 0 : salary || 0;
    const finalCommission = isTailor ? (commissionRate ?? 50) : 0;

    const pass = `${validation.data.email}2026`;
    const hashPassword = await bcrypt.hash(pass, 10);

    const newUserData = {
      ...validation.data,
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
      .select()
      .single();

    if (error)
      return NextResponse.json({ message: error.message }, { status: 400 });

    revalidateTag("employees-list", "default");
    revalidatePath("/dashboard/employees");

    return NextResponse.json(
      { message: "تمت إضافة الموظف بنجاح", data },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في معالجة الطلب", error: err.message },
      { status: 500 },
    );
  }
}
