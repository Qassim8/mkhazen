import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth";
import { createSupplierSchema } from "@/app/dashboard/suppliers/schemas/supplier.schemas";

export async function GET(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { message: "غير مصرح لك بالوصول. يرجى تسجيل الدخول أولاً." },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status");
    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "10");

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin.from("suppliers").select("*", { count: "exact" });

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`,
      );
    }

    if (status === "active") {
      query = query.eq("isActive", true);
    } else if (status === "inactive") {
      query = query.eq("isActive", false);
    }

    query = query.order("createdAt", { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { message: `فشل في جلب الموردين: ${error.message}` },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        data: data || [],
        meta: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit) || 1,
        },
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء جلب الموردين", error: err.message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { message: "غير مصرح لك بإجراء هذه العملية. يرجى تسجيل الدخول أولاً." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const validation = createSupplierSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات المورد غير صحيحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const payload = {
      ...validation.data,
      address: validation.data.address ?? null,
      contactPerson: validation.data.contactPerson ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("suppliers")
      .insert([payload])
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { message: `فشل إنشاء المورد: ${error.message}` },
        { status: 400 },
      );
    }

    revalidateTag("suppliers-list", "default");
    revalidatePath("/dashboard/suppliers");

    return NextResponse.json(
      { message: "تم إضافة المورد بنجاح", data },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء إضافة المورد", error: err.message },
      { status: 500 },
    );
  }
}
