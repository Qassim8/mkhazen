import { NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/permissions-server";

import { isUuid } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { cleanCustomerPhone } from "@/lib/customer-phone";
import { loadCustomerOrders, loadCustomerPayments, summarizeOrders } from "@/lib/customers-server";
import { supabaseAdmin } from "@/lib/supabase";

import { customerInputSchema, findExactPhoneOwner, findPhoneDuplicates } from "../_lib/customer-helpers";

type Params = { params: Promise<{ id: string }> };

const COLUMNS = "id, name, whatsapp_number, phone_normalized, notes, created_at, updated_at, measurements";

/**
 * GET /api/customers/[id] — بيانات العميل (customers.view)
 *   الافتراضي: الشكل القديم (يستخدمه نموذج التفصيل)
 *   ?detail=true: + الإحصاءات وكل فواتيره (كاشير وتفصيل) وسجل دفعاته
 */
export async function GET(request: Request, { params }: Params) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json(
        { message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." },
        { status: 500 },
      );
    }

    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;
    if (!user || !can(user.role, "customers.view")) {
      return NextResponse.json({ message: "غير مصرح.", code: "FORBIDDEN" }, { status: 403 });
    }

    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ message: "معرف العميل غير صالح." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("customers")
      .select(COLUMNS)
      .eq("id", id)
      .eq("branch_id", MAIN_BRANCH_ID)
      .maybeSingle();

    if (error) throw new Error(`تعذر جلب بيانات العميل: ${error.message}`);
    if (!data) {
      return NextResponse.json({ message: "العميل غير موجود." }, { status: 404 });
    }

    const base = {
      id: data.id,
      name: data.name,
      whatsapp_number: data.whatsapp_number,
      phone_normalized: data.phone_normalized,
      notes: data.notes,
      created_at: data.created_at,
      measurements: Array.isArray(data.measurements) ? data.measurements : [],
      order_count: 0,
    };

    if (new URL(request.url).searchParams.get("detail") !== "true") {
      return NextResponse.json({ data: base });
    }

    const orders = await loadCustomerOrders([id]);
    const [payments, duplicates] = await Promise.all([
      loadCustomerPayments(orders),
      findPhoneDuplicates(data.whatsapp_number, id),
    ]);

    return NextResponse.json({
      data: {
        ...base,
        order_count: orders.length,
        stats: summarizeOrders(orders),
        orders: [...orders].sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt)),
        payments,
        duplicates,
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/customers/[id]:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "تعذر جلب بيانات العميل.",
      },
      { status: 500 },
    );
  }
}

/** PUT /api/customers/[id] — تعديل الاسم والهاتف/واتساب والملاحظات (customers.update) */
export async function PUT(request: Request, { params }: Params) {
  const guard = await requirePermission("customers.update");
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ message: "معرف العميل غير صالح." }, { status: 400 });
    }

    const validation = customerInputSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات العميل غير صالحة.",
          code: "VALIDATION_ERROR",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { name, whatsappNumber, notes } = validation.data;

    const { data, error } = await supabaseAdmin
      .from("customers")
      .update({
        name,
        whatsapp_number: cleanCustomerPhone(whatsappNumber),
        notes: notes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("branch_id", MAIN_BRANCH_ID)
      .select(COLUMNS)
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        const owner = await findExactPhoneOwner(whatsappNumber);
        return NextResponse.json(
          {
            message: `هذا الرقم مسجل بنفس الصيغة للعميل «${owner?.name ?? "آخر"}». افتح العميل الموجود أو ادمجهما.`,
            code: "DUPLICATE_PHONE",
            errors: { existing: owner },
          },
          { status: 409 },
        );
      }
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json({ message: "العميل غير موجود." }, { status: 404 });
    }

    return NextResponse.json({
      message: "تم حفظ بيانات العميل.",
      data: {
        id: data.id,
        name: data.name,
        whatsapp_number: data.whatsapp_number,
        phone_normalized: data.phone_normalized,
        notes: data.notes,
      },
      duplicates: await findPhoneDuplicates(data.whatsapp_number, id),
    });
  } catch (error: unknown) {
    console.error("PUT /api/customers/[id]:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "تعذر حفظ بيانات العميل." },
      { status: 500 },
    );
  }
}

/** DELETE /api/customers/[id] — حذف عميل بلا فواتير فقط (customers.delete: المالك والمدير) */
export async function DELETE(_request: Request, { params }: Params) {
  const guard = await requirePermission("customers.delete", "حذف العملاء متاح للمالك أو المدير فقط.");
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ message: "معرف العميل غير صالح." }, { status: 400 });
    }

    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("id, name")
      .eq("id", id)
      .eq("branch_id", MAIN_BRANCH_ID)
      .maybeSingle();

    if (!customer) {
      return NextResponse.json({ message: "العميل غير موجود." }, { status: 404 });
    }

    // أي فاتورة (حتى الملغاة) تمنع الحذف حفاظًا على السجل؛ الدمج هو البديل
    const { count, error: countError } = await supabaseAdmin
      .from("sales_orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", id);

    if (countError) throw new Error(countError.message);

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          message: `لا يمكن حذف «${customer.name}» لأن له ${count} فاتورة/طلب. يمكنك دمجه مع عميل آخر بدل الحذف.`,
          code: "BUSINESS_RULE",
        },
        { status: 409 },
      );
    }

    // الشرط على عدم وجود فواتير يُعاد التحقق منه في قاعدة البيانات بقيد FK (ON DELETE SET NULL يعني
    // أن الحذف الفعلي آمن هنا لأن العدّاد أعلاه صفر)
    const { error } = await supabaseAdmin.from("customers").delete().eq("id", id).eq("branch_id", MAIN_BRANCH_ID);
    if (error) throw new Error(error.message);

    return NextResponse.json({ message: "تم حذف العميل." });
  } catch (error: unknown) {
    console.error("DELETE /api/customers/[id]:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "تعذر حذف العميل." },
      { status: 500 },
    );
  }
}
