import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth";
import { createSupplierSchema } from "@/app/dashboard/suppliers/schemas/supplier.schemas";

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
    const search = (searchParams.get("search") || "").trim().slice(0, 100);
    const status = searchParams.get("status");
    const rawPage = Number(searchParams.get("page"));
    const rawLimit = Number(searchParams.get("limit"));

    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

    const limit =
      Number.isInteger(rawLimit) && rawLimit > 0 && rawLimit <= 100
        ? rawLimit
        : 10;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin.from("suppliers").select("*", { count: "exact" });

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,contactPerson.ilike.%${search}%`,
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "حدث خطأ غير متوقع";
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء جلب الموردين", error: message },
      { status: 500 },
    );
  }
}

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
      notes: validation.data.notes ?? null,
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "حدث خطأ غير متوقع";
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء إضافة المورد", error: message },
      { status: 500 },
    );
  }
}
