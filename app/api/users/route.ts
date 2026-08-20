import bcrypt from "bcryptjs";
// src/app/api/employees/route.ts
import { NextResponse } from "next/server";
import {
  employeeQuerySchema,
  createEmployeeSchema,
} from "@/lib/validations/employee.schemas";
import { supabaseAdmin } from "@/lib/supabase";
import { MAIN_BRANCH_ID } from "@/lib/constants";

// GET: جلب الموظفين مفلترين تلقائياً بـ MAIN_BRANCH_ID
export async function GET(request: Request) {
  try {
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

    const { page, limit, search, position, shift, status } = parsedQuery.data;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // الحقن التلقائي للفرع الرئيسي
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
    if (status) query = query.eq("status", status);

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

// POST: إضافة موظف مع ربطه تلقائياً بالفرع الرئيسي
export async function POST(request: Request) {
  try {
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

    const { position, email, salary, commissionRate } = validation.data;

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
